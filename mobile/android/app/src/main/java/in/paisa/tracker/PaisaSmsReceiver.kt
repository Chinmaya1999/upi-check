package `in`.paisa.tracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/** Wakes on every incoming SMS (even with the app closed) so the widgets and lock-screen card update instantly. */
class PaisaSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    try {
      val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
      // Long messages arrive in several parts: stitch them back together per sender.
      for ((address, msgs) in parts.groupBy { it.originatingAddress ?: "" }) {
        val body = msgs.joinToString("") { it.messageBody ?: "" }
        val parsed = LiveTotals.parseSms(address, body) ?: continue
        LiveTotals.record(context, parsed, msgs.first().timestampMillis)
      }
    } catch (_: Exception) { /* never crash the SMS broadcast; the app re-reads the inbox on next open */ }
  }
}
