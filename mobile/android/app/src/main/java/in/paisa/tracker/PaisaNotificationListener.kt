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
    // Group summaries repeat their children; counting both would double the payment.
    if (sbn.notification.flags and android.app.Notification.FLAG_GROUP_SUMMARY != 0) return
    val ex = sbn.notification.extras
    val title = ex.getCharSequence("android.title")?.toString() ?: ""
    val text = (ex.getCharSequence("android.bigText") ?: ex.getCharSequence("android.text"))?.toString() ?: ""
    if (title.isBlank() && text.isBlank()) return
    // Update widgets / lock-screen card right away, even when the app is closed. The app recomputes exactly on next sync.
    try { LiveTotals.parseNotification(sbn.packageName, title, text)?.let { LiveTotals.record(this, it, sbn.postTime) } } catch (_: Exception) { }
    val sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    synchronized(LOCK) {
      val arr = JSONArray(sp.getString(KEY, "[]"))
      val id = "${sbn.key}|${sbn.postTime}"
      for (i in 0 until arr.length()) if (arr.getJSONObject(i).getString("id") == id) return
      arr.put(JSONObject().put("id", id).put("pkg", sbn.packageName).put("title", title).put("text", text).put("postedAt", sbn.postTime))
      // keep the buffer bounded if the app is never opened
      val trimmed = JSONArray()
      for (i in maxOf(0, arr.length() - 500) until arr.length()) trimmed.put(arr.get(i))
      sp.edit().putString(KEY, trimmed.toString()).apply()
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
    val MESSAGING_PACKAGES = setOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms")
  }
}
