package com.mark.oxidedeck

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews

class StreakWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        private const val PREFS_NAME = "oxide_deck_widget_prefs"
        const val KEY_STREAK_DAYS = "streak_days"
        const val KEY_PROGRESS_TODAY = "progress_today"
        const val KEY_TARGET_TODAY = "target_today"
        const val KEY_CONDITION_MET = "condition_met"
        const val KEY_DUE_COUNT = "due_count"

        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val streakDays = prefs.getInt(KEY_STREAK_DAYS, 0)
            val progressToday = prefs.getInt(KEY_PROGRESS_TODAY, 0)
            val targetToday = prefs.getInt(KEY_TARGET_TODAY, 1)
            val conditionMet = prefs.getBoolean(KEY_CONDITION_MET, false)
            val dueCount = prefs.getInt(KEY_DUE_COUNT, 0)

            val views = RemoteViews(context.packageName, R.layout.widget_streak)

            // 1. Streak count
            views.setTextViewText(R.id.widget_streak_count, "$streakDays Days")

            // 2. Due cards pill
            views.setTextViewText(R.id.widget_due_pill, "$dueCount Due")
            if (dueCount > 0) {
                views.setTextColor(R.id.widget_due_pill, Color.parseColor("#FF5C5C"))
            } else {
                views.setTextColor(R.id.widget_due_pill, Color.parseColor("#3B9C66"))
            }

            // 3. Status text
            if (conditionMet) {
                views.setTextViewText(R.id.widget_status_text, "✓ Streak secured today!")
                views.setTextColor(R.id.widget_status_text, Color.parseColor("#3B9C66")) // Green
            } else if (targetToday > 1) {
                views.setTextViewText(R.id.widget_status_text, "$progressToday / $targetToday cards to extend")
                views.setTextColor(R.id.widget_status_text, Color.parseColor("#F59E0B")) // Amber
            } else if (dueCount > 0) {
                views.setTextViewText(R.id.widget_status_text, "Cards due for review today")
                views.setTextColor(R.id.widget_status_text, Color.parseColor("#A0A0B0"))
            } else {
                views.setTextViewText(R.id.widget_status_text, "All caught up for today")
                views.setTextColor(R.id.widget_status_text, Color.parseColor("#A0A0B0"))
            }

            // 4. Tap action to open app
            val intent = Intent(context, MainActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        fun updateAllWidgets(
            context: Context,
            streakDays: Int,
            progressToday: Int,
            targetToday: Int,
            conditionMet: Boolean,
            dueCount: Int
        ) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putInt(KEY_STREAK_DAYS, streakDays)
                .putInt(KEY_PROGRESS_TODAY, progressToday)
                .putInt(KEY_TARGET_TODAY, targetToday)
                .putBoolean(KEY_CONDITION_MET, conditionMet)
                .putInt(KEY_DUE_COUNT, dueCount)
                .apply()

            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, StreakWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)

            for (appWidgetId in appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId)
            }
        }
    }
}
