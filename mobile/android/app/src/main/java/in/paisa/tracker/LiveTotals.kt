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
  /** Offers / rewards / ads from payment apps: never a transaction, even when they mention an amount ("Get 50% off ... Rs. 299"). */
  private val PROMO_NOTE = Regex("""\b(?:cashback|rewards?|scratch|offers?|win|bonus|coupons?|vouchers?|get up to|earn|discounts?|refer|unlock|deals?|sale|% ?off|off\*|minimum purchase|purchase value|min(?:imum)? order|website|app now|download|invite|claim|exclusive|hurry|limited time|expires?|valid (?:till|until|on)|use code|t&c)\b|%\s*off|\boff\*""", RegexOption.IGNORE_CASE)
  /** App notifications must state a completed payment: only unambiguous verbs ("purchase" alone is an ad). */
  private val APP_DEBIT = Regex("""\b(?:debited|paid|sent|payment of|spent|withdrawn|transferred to)\b""", RegexOption.IGNORE_CASE)
  private val APP_CREDIT = Regex("""\b(?:credited|received|refund(?:ed)?|deposited)\b""", RegexOption.IGNORE_CASE)
  private val DEBIT = Regex("""\b(debited|debit|spent|sent|paid|withdrawn|purchase|purchased|deducted|transferred to|trf to)\b""", RegexOption.IGNORE_CASE)
  private val CREDIT = Regex("""\b(credited|credit(?:ed)? to|received|deposited|refund(?:ed)?)\b""", RegexOption.IGNORE_CASE)
  private val AMOUNT = Regex("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)
  private val BALANCE = Regex("""\b(?:avl|avail(?:able)?|total|clear)\.?\s*bal""", RegexOption.IGNORE_CASE)
  private val REF = Regex("""(?:upi\s*(?:ref(?:erence)?)?(?:\s*no\.?)?|ref(?:erence)?(?:\s*no\.?)?|rrn|utr|txn\s*id)\W{0,4}(\d{12})\b""", RegexOption.IGNORE_CASE)
  private val TXN_ANCHOR = Regex("""\b(?:a/c|acct?|account|card|upi|vpa|imps|neft|rtgs|atm)\b|\bx{2,}\d{3,4}\b|\*{2,}\d{3,4}""", RegexOption.IGNORE_CASE)
  private val FAKE_HINT = Regex("""\b(?:won|winner|lottery|prize|congratulations|claim|gift|click here|update your kyc|(?:will be )?(?:blocked|suspended)|bit\.ly|tinyurl|sale|discount|cashback|bonus|redeem|rewards?|points?|vouchers?|coupons?|promo|promo code|use code|coupon code|code:|use [A-Z0-9]{5,}|shop now|visit|t&c|worth|checkout|benefit|exclusive|warranty|exchange|birthday|off on|min(?:imum)?\s+(?:purchase|order|rs)|order\s*#|enjoy|receipt no)\b""", RegexOption.IGNORE_CASE)
  private val LINK = Regex("""https?://|\bwww\.|\b[a-z0-9-]+\.(?:io|ltd|co|com|in|me)/|\bbit\.ly""", RegexOption.IGNORE_CASE)
  private val MASKED_ACCOUNT = Regex("""\b(?:a/c|acct?|account|card)\W{0,6}(?:no\.?\W{0,3})?(?:x+|\*+|\.+)?\s?\d{3,4}\b""", RegexOption.IGNORE_CASE)
  private val BUNDLE = Regex("""\+\s*\d+\s*more\b|\b\d+\s+(?:new\s+)?(?:messages?|notifications?|transactions?)\b""", RegexOption.IGNORE_CASE)
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
    if (NOT_A_TXN.containsMatchIn(body) || FAKE_HINT.containsMatchIn(body) || !TXN_ANCHOR.containsMatchIn(body) || (LINK.containsMatchIn(body) && !MASKED_ACCOUNT.containsMatchIn(body))) return null
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
    if (BUNDLE.containsMatchIn(t) || NOT_A_TXN.containsMatchIn(t) || PROMO_NOTE.containsMatchIn(t) || Regex("""\b(pending|processing)\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) return null
    val amt = AMOUNT.find(t) ?: return null
    val paid = Regex("""\b(?:paid|sent|payment of)\b.*?\bto\s+.{2,40}""", RegexOption.IGNORE_CASE).containsMatchIn(t)
    val recv = Regex("""\b(?:received|credited)\b.*?\bfrom\s+.{2,40}""", RegexOption.IGNORE_CASE).containsMatchIn(t)
    val sentYou = Regex("""\b(?:sent|paid|transferred)\s+you\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)
    val debit = when {
      sentYou -> false
      paid && !Regex("received", RegexOption.IGNORE_CASE).containsMatchIn(t.take(12)) -> true
      recv -> false
      else -> {                              // bank-app wording: "Rs 500 debited from a/c ..."
        val d = APP_DEBIT.find(t)?.range?.first ?: -1
        val c = APP_CREDIT.find(t)?.range?.first ?: -1
        when {
          d < 0 && c < 0 -> return null
          d < 0 -> false
          c < 0 -> true
          else -> d < c
        }
      }
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
