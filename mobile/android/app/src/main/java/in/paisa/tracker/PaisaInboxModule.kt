package `in`.paisa.tracker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import java.io.File
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray

/** Bridge for on-device inputs: bank SMS (READ_SMS) and payment-app notifications (Notification Access). */
class PaisaInboxModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "PaisaInbox"

  /** SMS received after [sinceMs], oldest first. Requires the READ_SMS runtime permission. */
  @ReactMethod
  fun readSms(sinceMs: Double, limit: Int, promise: Promise) {
    try {
      val out = Arguments.createArray()
      ctx.contentResolver.query(
        Uri.parse("content://sms/inbox"),
        arrayOf("_id", "address", "body", "date"),
        "date > ?", arrayOf(sinceMs.toLong().toString()),
        "date ASC LIMIT $limit",
      )?.use { c ->
        while (c.moveToNext()) {
          val m = Arguments.createMap()
          m.putString("id", c.getString(0))
          m.putString("address", c.getString(1) ?: "")
          m.putString("body", c.getString(2) ?: "")
          m.putDouble("date", c.getLong(3).toDouble())
          out.pushMap(m)
        }
      }
      promise.resolve(out)
    } catch (e: SecurityException) {
      promise.reject("E_SMS_PERMISSION", "READ_SMS permission not granted", e)
    } catch (e: Exception) {
      promise.reject("E_SMS", e.message, e)
    }
  }

  /** Pushes the headline numbers to the home-screen widget. Amounts are in paise; budgetPct is -1 when no budget is set. */
  @ReactMethod
  fun updateWidget(todayDebit: Double, todayCredit: Double, monthDebit: Double, weekDebit: Double, budgetPct: Int, budgetLabel: String, dayKey: String) {
    PaisaWidgetProvider.save(ctx, todayDebit.toLong(), todayCredit.toLong(), monthDebit.toLong(), weekDebit.toLong(), budgetPct, budgetLabel, dayKey)
  }

  /** Lock-screen / notification-shade card with today's spend (kept in step by the app, the SMS receiver and the notification listener). */
  @ReactMethod
  fun setLockScreenCard(enabled: Boolean) { LiveNotification.setEnabled(ctx, enabled) }

  @ReactMethod
  fun isLockScreenCardEnabled(promise: Promise) { promise.resolve(LiveNotification.enabled(ctx)) }

  /** Posts a budget alert. Two channels so the user's sound preference is honoured (Android fixes sound per channel). */
  @ReactMethod
  fun notify(title: String, body: String, id: Int, sound: Boolean) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = if (sound) "paisa_alerts" else "paisa_alerts_silent"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(channel) == null) {
      val c = NotificationChannel(channel, if (sound) "Budget alerts" else "Budget alerts (silent)", NotificationManager.IMPORTANCE_HIGH)
      c.description = "Warns you when spending crosses a daily, weekly or monthly budget"
      c.enableVibration(true)
      if (sound) {
        c.setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
          AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
        )
      } else c.setSound(null, null)
      nm.createNotificationChannel(c)
    }
    val open = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val b = NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(ctx.applicationInfo.icon)
      .setContentTitle(title).setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentIntent(pi).setAutoCancel(true)
    if (sound) b.setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
    try { nm.notify(id, b.build()) } catch (_: SecurityException) { /* POST_NOTIFICATIONS not granted */ }
  }

  /** Saves a report into the public Downloads folder and returns where it went. */
  @ReactMethod
  fun saveReport(name: String, content: String, mime: String, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, name)
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Paisa")
        }
        val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("Could not create file")
        ctx.contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray(Charsets.UTF_8)) }
        promise.resolve("Downloads/Paisa/$name")
      } else {
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Paisa").apply { mkdirs() }
        File(dir, name).writeText(content, Charsets.UTF_8)
        promise.resolve("Downloads/Paisa/$name")
      }
    } catch (e: Exception) {
      promise.reject("E_REPORT", e.message, e)
    }
  }

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    promise.resolve(NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName))
  }

  @ReactMethod
  fun openNotificationAccessSettings() {
    val i = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(i)
  }

  /** Returns payment-app notifications captured since the last call, and clears the buffer. */
  @ReactMethod
  fun drainNotifications(promise: Promise) {
    try {
      val sp = ctx.getSharedPreferences(PaisaNotificationListener.PREFS, Context.MODE_PRIVATE)
      val out = Arguments.createArray()
      synchronized(PaisaNotificationListener.LOCK) {
        val arr = JSONArray(sp.getString(PaisaNotificationListener.KEY, "[]"))
        for (i in 0 until arr.length()) {
          val o = arr.getJSONObject(i)
          val m = Arguments.createMap()
          m.putString("id", o.getString("id"))
          m.putString("pkg", o.getString("pkg"))
          m.putString("title", o.optString("title"))
          m.putString("text", o.optString("text"))
          m.putDouble("postedAt", o.getLong("postedAt").toDouble())
          out.pushMap(m)
        }
        sp.edit().putString(PaisaNotificationListener.KEY, "[]").apply()
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("E_NTF", e.message, e)
    }
  }
}
