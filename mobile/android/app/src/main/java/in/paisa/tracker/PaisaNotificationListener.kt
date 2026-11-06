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
      // Bank apps
      "com.snapwork.hdfc", "com.sbi.lotusintouch", "com.sbi.SBIFreedomPlus", "com.csam.icici.bank.imobile", "com.icicibank.pockets",
      "com.axis.mobile", "com.msf.kbank.mobile", "com.bankofbaroda.mconnect", "com.canarabank.mobility", "com.idfcfirstbank.optimus", "com.yesbank",
    )
    /** SMS apps (direct build only, see allow_messaging_notifications). */
    val MESSAGING_PACKAGES = setOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.truecaller")
  }
}
