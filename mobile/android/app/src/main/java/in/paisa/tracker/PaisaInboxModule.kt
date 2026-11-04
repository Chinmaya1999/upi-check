package `in`.paisa.tracker

import android.content.Context
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
  fun updateWidget(todayDebit: Double, todayCredit: Double, monthDebit: Double, budgetPct: Int, dayKey: String) {
    PaisaWidgetProvider.save(ctx, todayDebit.toLong(), todayCredit.toLong(), monthDebit.toLong(), budgetPct, dayKey)
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
