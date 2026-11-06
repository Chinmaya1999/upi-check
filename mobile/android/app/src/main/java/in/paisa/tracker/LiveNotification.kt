package `in`.paisa.tracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat

/**
 * Every notification Paisa shows is built here: colourful gradient cards (custom layouts inside the system's decorated style),
 * with a rupee status icon and a per-type accent colour.
 *  - lock-screen card: today's spend, always up to date
 *  - payment notification: "💸 ₹30 spent" (red) / "💰 ₹500 received" (green)
 *  - budget alerts: amber at 80 %, red when exceeded
 */
object LiveNotification {
  private const val ID = 7001
  private const val CHANNEL_CARD = "paisa_live"
  private const val CHANNEL_TXN = "paisa_txn"

  private fun prefs(c: Context) = c.getSharedPreferences(PaisaWidgetProvider.PREFS, Context.MODE_PRIVATE)
  private fun nm(c: Context) = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun enabled(context: Context) = prefs(context).getBoolean("lockEnabled", true)
  fun setEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean("lockEnabled", on).apply(); update(context) }

  fun txnEnabled(context: Context) = prefs(context).getBoolean("txnNotify", true)
  fun setTxnEnabled(context: Context, on: Boolean) { prefs(context).edit().putBoolean("txnNotify", on).apply() }

  private fun openApp(context: Context, code: Int): PendingIntent {
    val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, code, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun ensureChannel(context: Context, id: String, name: String, desc: String, importance: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val m = nm(context)
    if (m.getNotificationChannel(id) != null) return
    val c = NotificationChannel(id, name, importance)
    c.description = desc
    c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    if (importance <= NotificationManager.IMPORTANCE_LOW) { c.setShowBadge(false); c.setSound(null, null) }
    m.createNotificationChannel(c)
  }

  /** A coloured message card: emoji badge + bold title + body, on a gradient picked by [bg]. */
  private fun messageView(context: Context, bg: Int, emoji: String, title: String, body: String): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.notif_alert)
    v.setInt(R.id.n_root, "setBackgroundResource", bg)
    v.setTextViewText(R.id.n_emoji, emoji)
    v.setTextViewText(R.id.n_title, title)
    v.setTextViewText(R.id.n_body, body)
    return v
  }
  private fun withoutEmoji(s: String) = s.replace(Regex("^[^\\p{L}\\p{N}₹]+"), "").trim()

  private fun base(context: Context, channel: String, accent: String): NotificationCompat.Builder =
    NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.drawable.ic_stat_paisa)
      .setColor(Color.parseColor(accent))
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openApp(context, channel.hashCode()))

  private fun post(context: Context, id: Int, n: Notification) {
    try { nm(context).notify(id, n) } catch (_: SecurityException) { /* POST_NOTIFICATIONS not granted */ }
  }

  // ───────── lock-screen card ─────────
  fun update(context: Context) {
    if (!enabled(context)) { nm(context).cancel(ID); return }
    val s = PaisaWidgetProvider.snapshot(context)
    if (!s.known) return
    ensureChannel(context, CHANNEL_CARD, "Today's spending (lock screen)", "A colourful, silent card with today's spend, kept up to date automatically", NotificationManager.IMPORTANCE_LOW)
    val r = PaisaWidgetProvider::rupees
    val small = RemoteViews(context.packageName, R.layout.notif_card_small).apply {
      setTextViewText(R.id.c_spent, r(s.spent)); setTextViewText(R.id.c_credit, r(s.credit))
    }
    val sp = prefs(context)
    val pct = sp.getInt("budgetPct", -1)
    val label = sp.getString("budgetLabel", "") ?: ""
    val big = RemoteViews(context.packageName, R.layout.notif_card_big).apply {
      setTextViewText(R.id.b_spent, r(s.spent)); setTextViewText(R.id.b_credit, r(s.credit))
      setTextViewText(R.id.b_week, r(s.week)); setTextViewText(R.id.b_month, r(s.month))
      setProgressBar(R.id.b_bar, 100, pct.coerceIn(0, 100), false)
      setViewVisibility(R.id.b_bar, if (pct >= 0) android.view.View.VISIBLE else android.view.View.GONE)
      setTextViewText(R.id.b_hint, when {
        pct >= 100 -> "🚨 $label budget exceeded ($pct%)"
        pct >= 80 -> "⚠️ $label budget $pct% used"
        pct >= 0 -> "$label budget · $pct% used"
        else -> "Set a budget in Paisa to track what's left"
      })
    }
    val n = base(context, CHANNEL_CARD, "#12B886")
      .setContentTitle("Spent today ${r(s.spent)}").setContentText("Received ${r(s.credit)} · This month ${r(s.month)}")
      .setCustomContentView(small).setCustomBigContentView(big)
      .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setShowWhen(true).setWhen(s.savedAt)
      .setPriority(NotificationCompat.PRIORITY_LOW).setCategory(NotificationCompat.CATEGORY_STATUS).build()
    post(context, ID, n)
  }

  // ───────── a payment was just detected ─────────
  fun postTransaction(context: Context, debit: Boolean, paise: Long) {
    if (!txnEnabled(context)) return
    ensureChannel(context, CHANNEL_TXN, "Payments", "A colourful heads-up each time a payment SMS or UPI notification is detected", NotificationManager.IMPORTANCE_DEFAULT)
    val s = PaisaWidgetProvider.snapshot(context)
    val amount = PaisaWidgetProvider.rupees(paise)
    val title = if (debit) "$amount spent" else "$amount received"
    val body = if (debit) "Today so far: ${PaisaWidgetProvider.rupees(s.spent)} spent · tap to see where it went" else "Money in! Today so far: ${PaisaWidgetProvider.rupees(s.credit)} received"
    val bg = if (debit) R.drawable.notif_bg_debit else R.drawable.notif_bg_credit
    val emoji = if (debit) "💸" else "💰"
    val n = base(context, CHANNEL_TXN, if (debit) "#E11D48" else "#059669")
      .setContentTitle(title).setContentText(body)
      .setCustomContentView(messageView(context, bg, emoji, title, body)).setCustomBigContentView(messageView(context, bg, emoji, title, body))
      .setGroup("paisa_txn").setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).setCategory(NotificationCompat.CATEGORY_EVENT).build()
    post(context, 10_000 + (System.currentTimeMillis() % 80_000).toInt(), n)
  }

  // ───────── budget alerts (called from the app) ─────────
  fun postAlert(context: Context, title: String, body: String, id: Int, sound: Boolean, level: String) {
    val channel = if (sound) "paisa_alerts" else "paisa_alerts_silent"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm(context).getNotificationChannel(channel) == null) {
      val c = NotificationChannel(channel, if (sound) "Budget alerts" else "Budget alerts (silent)", NotificationManager.IMPORTANCE_HIGH)
      c.description = "Warns you when spending crosses a daily, weekly or monthly budget"
      c.enableVibration(true)
      c.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      if (sound) {
        c.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION),
          android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      } else c.setSound(null, null)
      nm(context).createNotificationChannel(c)
    }
    val (bg, emoji, accent) = when (level) {
      "over" -> Triple(R.drawable.notif_bg_over, "🚨", "#DC2626")
      "warn" -> Triple(R.drawable.notif_bg_warn, "⚠️", "#EA580C")
      else -> Triple(R.drawable.notif_bg_info, "🔔", "#4F46E5")
    }
    val clean = withoutEmoji(title)
    val b = base(context, channel, accent)
      .setContentTitle(clean).setContentText(body)
      .setCustomContentView(messageView(context, bg, emoji, clean, body)).setCustomBigContentView(messageView(context, bg, emoji, clean, body))
      .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER).setAutoCancel(true)
    if (sound) b.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
    post(context, id, b.build())
  }
}
