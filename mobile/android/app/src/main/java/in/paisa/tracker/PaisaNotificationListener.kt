package `in`.paisa.tracker

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Captures notifications posted by UPI apps only (allow-list below), after the user grants
 * Notification Access. Nothing else is read or stored.
 */
class PaisaNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName !in PACKAGES) return
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
    val PACKAGES = setOf(
      "com.google.android.apps.nbu.paisa.user", // Google Pay
      "com.phonepe.app",
      "net.one97.paytm",
      "in.org.npci.upiapp", // BHIM
    )
  }
}
