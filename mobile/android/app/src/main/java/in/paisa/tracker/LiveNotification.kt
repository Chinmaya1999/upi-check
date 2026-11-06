package `in`.paisa.tracker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/** A quiet, always-on card ("Spent today ₹1,240") that shows on the lock screen and in the notification shade. */
object LiveNotification {
  private const val ID = 7001
  private const val CHANNEL = "paisa_live"

  fun enabled(context: Context) = context.getSharedPreferences(PaisaWidgetProvider.PREFS, Context.MODE_PRIVATE).getBoolean("lockEnabled", true)

  fun setEnabled(context: Context, on: Boolean) {
    context.getSharedPreferences(PaisaWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putBoolean("lockEnabled", on).apply()
    update(context)
  }

  fun update(context: Context) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (!enabled(context)) { nm.cancel(ID); return }
    val s = PaisaWidgetProvider.snapshot(context)
    if (!s.known) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      val c = NotificationChannel(CHANNEL, "Today's spending (lock screen)", NotificationManager.IMPORTANCE_LOW)
      c.description = "A silent card showing what you spent today, kept up to date automatically"
      c.setShowBadge(false)
      c.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      nm.createNotificationChannel(c)
    }
    val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pi = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Spent today ${PaisaWidgetProvider.rupees(s.spent)}")
      .setContentText("Received ${PaisaWidgetProvider.rupees(s.credit)}  ·  This month ${PaisaWidgetProvider.rupees(s.month)}")
      .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setShowWhen(true).setWhen(s.savedAt)
      .setPriority(NotificationCompat.PRIORITY_LOW).setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(pi).build()
    try { nm.notify(ID, n) } catch (_: SecurityException) { /* POST_NOTIFICATIONS not granted */ }
  }
}
