package `in`.paisa.tracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import kotlin.math.abs
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Home-screen widget. Numbers are pushed by the app (PaisaInboxModule.updateWidget) and cached in SharedPreferences. */
class PaisaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, render(context)) }
  }

  companion object {
    const val PREFS = "paisa_widget"

    private val inr = NumberFormat.getIntegerInstance(Locale("en", "IN"))
    /** Exact amount, same rule as the app's formatINR: paise are shown whenever they are not zero (₹219.60, ₹220). */
    fun rupees(paise: Long): String {
      val p = abs(paise)
      val frac = p % 100
      return (if (paise < 0) "-₹" else "₹") + inr.format(p / 100) + (if (frac != 0L) "." + frac.toString().padStart(2, '0') else "")
    }
    private fun istDay(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date())

    /** Called from JS after every data change. */
    fun save(context: Context, todayDebit: Long, todayCredit: Long, monthDebit: Long, weekDebit: Long, budgetPct: Int, budgetLabel: String, dayKey: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putLong("todayDebit", todayDebit).putLong("todayCredit", todayCredit).putLong("monthDebit", monthDebit).putLong("weekDebit", weekDebit)
        .putString("budgetLabel", budgetLabel).putInt("budgetPct", budgetPct).putString("dayKey", dayKey).putLong("savedAt", System.currentTimeMillis()).apply()
      refresh(context)
    }

    /** Called from JS when a festival goes live / ends (null greeting = off). Widgets then show an animated emoji strip. */
    fun saveFestival(context: Context, greeting: String?, particles: String, accent: String) {
      val e = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      if (greeting.isNullOrBlank()) e.remove("festGreeting") else e.putString("festGreeting", greeting).putString("festParticles", particles).putString("festAccent", accent)
      e.apply()
      refresh(context)
    }

    /** Shows (or hides) the festive strip and background on a widget layout. root = the widget's root view id. */
    private fun applyFestival(context: Context, v: RemoteViews, rootId: Int, defaultBg: Int) {
      val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val greeting = sp.getString("festGreeting", null)
      if (greeting.isNullOrBlank()) {
        v.setViewVisibility(R.id.w_fest, android.view.View.GONE)
        v.setInt(rootId, "setBackgroundResource", defaultBg)
        return
      }
      val emojis = (sp.getString("festParticles", "") ?: "").split(",").filter { it.isNotBlank() }.ifEmpty { listOf("🎉") }
      listOf(R.id.w_fest_e1, R.id.w_fest_e2, R.id.w_fest_e3, R.id.w_fest_e4).forEachIndexed { i, id -> v.setTextViewText(id, emojis[i % emojis.size]) }
      v.setTextViewText(R.id.w_fest_text, greeting)
      try { v.setTextColor(R.id.w_fest_text, android.graphics.Color.parseColor(sp.getString("festAccent", "#FDE68A"))) } catch (_: Exception) { }
      v.setViewVisibility(R.id.w_fest, android.view.View.VISIBLE)
      v.setInt(rootId, "setBackgroundResource", R.drawable.widget_bg_festive)
    }

    class Snapshot(val known: Boolean, val spent: Long, val credit: Long, val month: Long, val week: Long, val savedAt: Long)

    /** What the widgets and the lock-screen card show. If the day rolled over since the last update, "today" is genuinely 0. */
    fun snapshot(context: Context): Snapshot {
      val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val known = sp.contains("dayKey")
      val fresh = sp.getString("dayKey", null) == istDay()
      return Snapshot(known, if (known && fresh) sp.getLong("todayDebit", 0) else 0, if (known && fresh) sp.getLong("todayCredit", 0) else 0,
        sp.getLong("monthDebit", 0), sp.getLong("weekDebit", 0), sp.getLong("savedAt", 0))
    }

    /** Repaints every placed widget (large + small) and the lock-screen card. */
    fun refresh(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      mgr.getAppWidgetIds(ComponentName(context, PaisaWidgetProvider::class.java)).forEach { mgr.updateAppWidget(it, render(context)) }
      mgr.getAppWidgetIds(ComponentName(context, PaisaSmallWidgetProvider::class.java)).forEach { mgr.updateAppWidget(it, renderSmall(context)) }
      LiveNotification.update(context)
    }

    internal fun renderSmall(context: Context): RemoteViews {
      val s = snapshot(context)
      val v = RemoteViews(context.packageName, R.layout.widget_small)
      v.setTextViewText(R.id.s_spent, if (s.known) rupees(s.spent) else "₹0")
      v.setTextViewText(R.id.s_sub, if (s.known) "Received ${rupees(s.credit)}" else "Open Paisa to start")
      val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      applyFestival(context, v, R.id.small_root, R.drawable.widget_bg)
      if (context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("festGreeting", null) != null) v.setViewVisibility(R.id.s_sub, android.view.View.GONE) else v.setViewVisibility(R.id.s_sub, android.view.View.VISIBLE)
      v.setOnClickPendingIntent(R.id.small_root, PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      return v
    }

    private fun render(context: Context): RemoteViews {
      val sp = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val v = RemoteViews(context.packageName, R.layout.widget_paisa)
      val known = sp.contains("dayKey")
      // If the phone's day has rolled over since the app last pushed data, "today" is genuinely 0 until the next sync.
      val fresh = sp.getString("dayKey", null) == istDay()
      val spent = if (known && fresh) sp.getLong("todayDebit", 0) else 0
      val credit = if (known && fresh) sp.getLong("todayCredit", 0) else 0
      v.setTextViewText(R.id.w_spent, rupees(spent))
      v.setTextViewText(R.id.w_credit, rupees(credit))
      v.setTextViewText(R.id.w_month, rupees(sp.getLong("monthDebit", 0)))
      v.setTextViewText(R.id.w_week, rupees(sp.getLong("weekDebit", 0)))
      v.setTextViewText(R.id.w_updated, if (known) SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(sp.getLong("savedAt", 0))) else "")
      val pct = sp.getInt("budgetPct", -1)
      val label = sp.getString("budgetLabel", "") ?: ""
      v.setProgressBar(R.id.w_bar, 100, pct.coerceIn(0, 100), false)
      v.setViewVisibility(R.id.w_bar, if (pct >= 0) android.view.View.VISIBLE else android.view.View.INVISIBLE)
      v.setTextViewText(R.id.w_hint, when {
        !known -> "Open Paisa to load your data"
        pct >= 100 -> "⚠ $label budget exceeded ($pct%)"
        pct >= 0 -> "$label budget · $pct% used"
        else -> "Tap to open Paisa · set a budget"
      })
      val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      applyFestival(context, v, R.id.widget_root, R.drawable.widget_bg)
      v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      return v
    }
  }
}

/** Compact 2x1 widget: just "Spent today" and the amount. */
class PaisaSmallWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, PaisaWidgetProvider.renderSmall(context)) }
  }
}
