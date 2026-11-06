package `in`.paisa.tracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Keeps the home-screen widgets and the lock-screen card live while the app is closed.
 * A Kotlin port of the amount/direction rules in @upi/core (sms.ts). It only *adds* to the cached totals;
 * the next time the app syncs it recomputes everything exactly and overwrites them (PaisaWidgetProvider.save).
 */
object LiveTotals {
  class Parsed(val debit: Boolean, val paise: Long, val ref: String?)

  private val NOT_A_TXN = Regex("""\b(otp|one[- ]time|verification code|will be (?:debited|credited)|has been requested|request(?:ed)? (?:money|from)|collect request|declined|failed|unsuccessful|reversed|not (?:been )?(?:debited|credited)|if not (?:done|you)|minimum (?:amount )?due|total (?:amount )?due|payment due|bill (?:of|for)|statement|e-?mandate|autopay|reminder|offer|cashback offer|apply now|click|loan|emi due)\b""", RegexOption.IGNORE_CASE)
  private val DEBIT = Regex("""\b(debited|debit|spent|sent|paid|withdrawn|purchase|purchased|deducted|transferred to|trf to)\b""", RegexOption.IGNORE_CASE)
  private val CREDIT = Regex("""\b(credited|credit(?:ed)? to|received|deposited|refund(?:ed)?)\b""", RegexOption.IGNORE_CASE)
  private val AMOUNT = Regex("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
  private val BALANCE = Regex("""\b(?:avl|avail(?:able)?|total|clear)\.?\s*bal""", RegexOption.IGNORE_CASE)
  private val REF = Regex("""(?:upi\s*(?:ref(?:erence)?)?(?:\s*no\.?)?|ref(?:erence)?(?:\s*no\.?)?|rrn|utr|txn\s*id)\W{0,4}(\d{12})\b""", RegexOption.IGNORE_CASE)
  private val PERSONAL_NUMBER = Regex("""^\+?[\d\s-]{8,}$""")
  private val LETTERS = Regex("""[A-Za-z]{3,}""")
  private const val WINDOW_MS = 20 * 60 * 1000L

  private fun paise(m: MatchResult) = (m.groupValues[1].replace(",", "").toDouble() * 100).roundToLong()

  private fun direction(text: String): Boolean? { // true = debit
    val d = DEBIT.find(text)?.range?.first ?: -1
    val c = CREDIT.find(text)?.range?.first ?: -1
    return when {
      d < 0 && c < 0 -> null
      d < 0 -> false
      c < 0 -> true
      else -> d < c
    }
  }

  fun parseSms(address: String, rawBody: String): Parsed? {
    if (address.isBlank() || PERSONAL_NUMBER.matches(address) || !LETTERS.containsMatchIn(address)) return null
    val body = rawBody.replace(Regex("\\s+"), " ").trim()
    if (NOT_A_TXN.containsMatchIn(body)) return null
    val bal = BALANCE.find(body)?.range?.first ?: -1
    val main = if (bal > 0) body.substring(0, bal) else body
    val amt = AMOUNT.find(main) ?: return null
    val debit = direction(main) ?: return null
    return Parsed(debit, paise(amt), REF.find(body)?.groupValues?.get(1))
  }

  private val APP_PACKAGES = PaisaNotificationListener.PACKAGES

  fun parseNotification(pkg: String, title: String, text: String): Parsed? {
    if (pkg !in APP_PACKAGES) return null
    val t = "$title $text".replace(Regex("\\s+"), " ").trim()
    if (NOT_A_TXN.containsMatchIn(t) || Regex("""\b(pending|processing)\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) return null
    val amt = AMOUNT.find(t) ?: return null
    val paid = Regex("""\b(?:paid|sent|payment of)\b.*?\bto\s+.{2,40}""", RegexOption.IGNORE_CASE).containsMatchIn(t)
    val recv = Regex("""\b(?:received|credited)\b.*?\bfrom\s+.{2,40}""", RegexOption.IGNORE_CASE).containsMatchIn(t)
    val debit = when {
      paid && !Regex("received", RegexOption.IGNORE_CASE).containsMatchIn(t.take(12)) -> true
      recv -> false
      else -> return null
    }
    return Parsed(debit, paise(amt), null)
  }

  private fun istDay(ms: Long = System.currentTimeMillis()): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date(ms))

  /** Adds one event to the cached totals (ignoring a repeat of one already counted) and repaints widgets + lock-screen card. */
  @Synchronized
  fun record(context: Context, p: Parsed, at: Long) {
    val sp = context.getSharedPreferences(PaisaWidgetProvider.PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    // The same payment usually arrives as a bank SMS *and* an app notification (or two bank SMS): count it once.
    val seen = JSONArray(sp.getString("recent", "[]"))
    val keep = JSONArray()
    var dup = false
    for (i in 0 until seen.length()) {
      val e = seen.getJSONObject(i)
      if (now - e.getLong("at") > 24 * 3600_000L) continue
      keep.put(e)
      val sameRef = p.ref != null && e.optString("ref") == p.ref
      val sameShape = e.getBoolean("debit") == p.debit && e.getLong("paise") == p.paise && abs(e.getLong("ts") - at) <= WINDOW_MS
      if (sameRef || sameShape) dup = true
    }
    if (dup) return
    keep.put(JSONObject().put("at", now).put("ts", at).put("debit", p.debit).put("paise", p.paise).put("ref", p.ref ?: ""))
    val trimmed = JSONArray()
    for (i in maxOf(0, keep.length() - 60) until keep.length()) trimmed.put(keep.get(i))

    val today = istDay()
    val ed = sp.edit().putString("recent", trimmed.toString())
    if (sp.getString("dayKey", null) != today) ed.putLong("todayDebit", 0).putLong("todayCredit", 0).putString("dayKey", today)
    if (p.debit) {
      ed.putLong("todayDebit", (if (sp.getString("dayKey", null) == today) sp.getLong("todayDebit", 0) else 0) + p.paise)
      ed.putLong("monthDebit", sp.getLong("monthDebit", 0) + p.paise)
      ed.putLong("weekDebit", sp.getLong("weekDebit", 0) + p.paise)
    } else {
      ed.putLong("todayCredit", (if (sp.getString("dayKey", null) == today) sp.getLong("todayCredit", 0) else 0) + p.paise)
    }
    ed.putLong("savedAt", now).apply()
    PaisaWidgetProvider.refresh(context)
    LiveNotification.postTransaction(context, p.debit, p.paise)
  }
}
