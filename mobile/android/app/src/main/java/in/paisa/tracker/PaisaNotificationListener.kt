package `in`.paisa.tracker

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures notifications posted by payment, wallet and bank apps only (allow-list below), after the user grants
 * Notification Access. Nothing else is read or stored. In the direct build, the phone's SMS app is also on the list
 * so bank messages delivered as RCS (which never reach the SMS inbox) are not missed; the Play build never reads it.
 */
class PaisaNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val pkg = sbn.packageName
    val isMessaging = pkg in MESSAGING_PACKAGES
    if (pkg !in PACKAGES && !(isMessaging && resources.getBoolean(R.bool.allow_messaging_notifications))) return
    val isTruecaller = pkg == "com.truecaller"
    // Group summaries repeat their children; counting both would double the payment. Truecaller often posts only a summary
    // that still carries the message lines, so it is the one app whose summaries are read (de-duplicated by text below).
    if (sbn.notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0 && !isTruecaller) return
    val ex = sbn.notification.extras
    val title = (ex.getCharSequence("android.title") ?: ex.getCharSequence("android.conversationTitle"))?.toString() ?: ""
    val text = (ex.getCharSequence("android.bigText") ?: ex.getCharSequence("android.text"))?.toString() ?: ""
    // (title, text) pairs to store. Chat-style notifications keep the real message in android.messages / android.textLines.
    val items = ArrayList<Pair<String, String>>()
    items.add(title to text)
    if (isMessaging) {
      try {
        @Suppress("DEPRECATION")
        ex.getParcelableArray("android.messages")?.forEach { m ->
          val b = m as? android.os.Bundle ?: return@forEach
          val body = b.getCharSequence("text")?.toString() ?: return@forEach
          val sender = b.getCharSequence("sender")?.toString() ?: (b.getParcelable<android.os.Bundle>("sender_person")?.getCharSequence("name")?.toString())
          items.add((sender?.takeIf { it.isNotBlank() } ?: title) to body)
        }
      } catch (_: Exception) { }
      ex.getCharSequenceArray("android.textLines")?.forEach { l -> items.add(title to l.toString()) }
    }
    // Truecaller's transaction card ("+ ₹10 / UPI transfer from X to Account 3804") keeps its text in separate extras and in a
    // custom layout, so gather every string it carries and let the app's Truecaller parser make sense of it.
    if (isTruecaller) {
      try {
        val all = LinkedHashSet<String>()
        for (k in ex.keySet()) {
          if (k == "android.title" || k.contains("icon", true) || k.contains("picture", true) || k.contains("template", true)) continue
          when (val v = ex.get(k)) {
            is CharSequence -> v.toString().trim().takeIf { it.isNotEmpty() }?.let { all.add(it) }
            is Array<*> -> v.forEach { e -> (e as? CharSequence)?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { all.add(it) } }
          }
        }
        for (rv in listOfNotNull(sbn.notification.bigContentView, sbn.notification.contentView, sbn.notification.headsUpContentView)) {
          try { collectText(rv.apply(applicationContext, android.widget.FrameLayout(this)), all) } catch (_: Throwable) { }
        }
        // Truecaller draws "+" (credit) / "-" (debit) as the amount's colour (green / red) and not as text: recover it.
        var sign: String? = null
        val colors = ArrayList<Int>()
        (ex.getCharSequence("android.title") as? android.text.Spanned)?.let { sp ->
          sp.getSpans(0, sp.length, android.text.style.ForegroundColorSpan::class.java).forEach { colors.add(it.foregroundColor) }
        }
        for (rv in listOfNotNull(sbn.notification.bigContentView, sbn.notification.contentView, sbn.notification.headsUpContentView)) {
          try { collectAmountColors(rv.apply(applicationContext, android.widget.FrameLayout(this)), colors) } catch (_: Throwable) { }
        }
        // A Truecaller transaction card is always a credit or a debit: green amount = credit, any other colour = debit.
        if (colors.isNotEmpty()) sign = if (colors.any { signOfColor(it) == "+" }) "+" else "-"
        android.util.Log.i("PAISATC", "sign=$sign colors=${colors.joinToString { Integer.toHexString(it) }}")
        val signedTitle = if (sign != null && !title.trimStart().startsWith("+") && !title.trimStart().startsWith("-") && !title.trimStart().startsWith("−")) "$sign $title" else title
        if (all.isNotEmpty()) items.add(signedTitle to all.joinToString(" | "))
      } catch (_: Throwable) { }
    }
    val sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    for ((t, body) in items) {
      if (t.isBlank() && body.isBlank()) continue
      // Update widgets / lock-screen card right away, even when the app is closed. The app recomputes exactly on next sync.
      try { LiveTotals.parseNotification(sbn.packageName, t, body)?.let { LiveTotals.record(this, it, sbn.postTime) } } catch (_: Exception) { }
      synchronized(LOCK) {
        val arr = JSONArray(sp.getString(KEY, "[]"))
        // Same message seen again (notification updated / summary + child): one id per message text, not per post time.
        val id = if (isMessaging) "${pkg}|${t}|${body.hashCode()}" else "${sbn.key}|${sbn.postTime}"
        var dup = false
        for (i in 0 until arr.length()) if (arr.getJSONObject(i).getString("id") == id) { dup = true; break }
        if (dup) return@synchronized
        arr.put(JSONObject().put("id", id).put("pkg", sbn.packageName).put("title", t).put("text", body).put("postedAt", sbn.postTime))
        // keep the buffer bounded if the app is never opened
        val trimmed = JSONArray()
        for (i in maxOf(0, arr.length() - 500) until arr.length()) trimmed.put(arr.get(i))
        sp.edit().putString(KEY, trimmed.toString()).apply()
      }
    }
  }

  private fun signOfColor(c: Int): String? {
    val r = android.graphics.Color.red(c); val g = android.graphics.Color.green(c); val b = android.graphics.Color.blue(c)
    return when {
      g > r + 30 && g > b + 30 -> "+"
      r > g + 30 && r > b + 30 -> "-"
      else -> null
    }
  }

  /** Text colours of amount-looking views (₹10, + ₹10) inside a custom notification layout. */
  private fun collectAmountColors(v: android.view.View, out: MutableList<Int>) {
    if (v is android.widget.TextView && Regex("^[+\\-−–\\s]*₹\\s*[\\d,.]+$").matches(v.text?.toString()?.trim() ?: "")) out.add(v.currentTextColor)
    if (v is android.view.ViewGroup) for (i in 0 until v.childCount) collectAmountColors(v.getChildAt(i), out)
  }

  private fun collectText(v: android.view.View, out: MutableSet<String>) {
    if (v is android.widget.TextView) v.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
    if (v is android.view.ViewGroup) for (i in 0 until v.childCount) collectText(v.getChildAt(i), out)
  }

  companion object {
    const val PREFS = "paisa_notifs"
    const val KEY = "buf"
    val LOCK = Any()
    /** Keep in step with APP_PACKAGES in packages/core/src/sms.ts. */
    val PACKAGES = setOf(
      // UPI & wallets
      "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm", "in.org.npci.upiapp",
      "in.amazon.mShop.android.shopping", "com.dreamplug.androidapp", "com.mobikwik_new", "com.freecharge.android",
      "com.myairtelapp", "com.jio.myjio", "indwin.c3.shareapp", "com.naviapp", "money.jupiter", "com.epifi.paisa", "com.enstage.wibmo.hdfc",
      "com.bharatpe.app", "com.fampay.in", "com.sliceit.app", "com.sbi.upi", "com.pnb.onestop", "com.infrasoft.uboi",
      "com.kotak811mobilebankingapp.instantsavingsupiscanandpayrecharge", "com.upi.axispay",
      // Bank apps
      "com.snapwork.hdfc", "com.sbi.lotusintouch", "com.sbi.SBIFreedomPlus", "com.csam.icici.bank.imobile", "com.icicibank.pockets",
      "com.axis.mobile", "com.msf.kbank.mobile", "com.bankofbaroda.mconnect", "com.canarabank.mobility", "com.idfcfirstbank.optimus", "com.yesbank",
    )
    /** SMS apps (direct build only, see allow_messaging_notifications). */
    val MESSAGING_PACKAGES = setOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.truecaller")
  }
}
