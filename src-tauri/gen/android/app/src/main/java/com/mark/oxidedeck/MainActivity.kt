package com.mark.oxidedeck

import android.content.Context
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import androidx.work.*
import java.util.concurrent.TimeUnit

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  companion object {
    private const val TAG = "MainActivity"

    @JvmStatic
    fun updateWidget(
      context: Context,
      streakDays: Int,
      progressToday: Int,
      targetToday: Int,
      conditionMet: Boolean,
      dueCount: Int
    ) {
      StreakWidgetProvider.updateAllWidgets(
        context,
        streakDays,
        progressToday,
        targetToday,
        conditionMet,
        dueCount
      )
    }

    @JvmStatic
    fun scheduleWebDavWork(
      context: Context,
      enabled: Boolean,
      intervalMinutes: Long,
      serverUrl: String,
      username: String,
      password: String,
      remotePath: String
    ) {
      val prefs = context.getSharedPreferences(WebDavSyncWorker.PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit()
        .putBoolean(WebDavSyncWorker.KEY_ENABLED, enabled)
        .putString(WebDavSyncWorker.KEY_SERVER_URL, serverUrl)
        .putString(WebDavSyncWorker.KEY_USERNAME, username)
        .putString(WebDavSyncWorker.KEY_PASSWORD, password)
        .putString(WebDavSyncWorker.KEY_REMOTE_PATH, remotePath)
        .apply()

      val workManager = WorkManager.getInstance(context)

      if (!enabled || serverUrl.isBlank() || username.isBlank()) {
        Log.d(TAG, "Cancelling WebDAV WorkManager background sync")
        workManager.cancelUniqueWork(WebDavSyncWorker.WORK_NAME)
        return
      }

      // Android WorkManager periodic interval minimum is 15 minutes by OS policy
      val actualInterval = Math.max(15L, intervalMinutes)

      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

      val syncRequest = PeriodicWorkRequestBuilder<WebDavSyncWorker>(
        actualInterval, TimeUnit.MINUTES,
        5, TimeUnit.MINUTES
      )
        .setConstraints(constraints)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()

      workManager.enqueueUniquePeriodicWork(
        WebDavSyncWorker.WORK_NAME,
        ExistingPeriodicWorkPolicy.UPDATE,
        syncRequest
      )
      Log.d(TAG, "Enqueued unique periodic WebDAV WorkManager sync (interval: $actualInterval minutes)")
    }
  }
}
