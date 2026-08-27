package com.mark.oxidedeck

import android.content.Context
import android.util.Base64
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

class WebDavSyncWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "WebDavSyncWorker"
        const val PREFS_NAME = "oxide_deck_webdav_prefs"
        const val KEY_ENABLED = "enabled"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_USERNAME = "username"
        const val KEY_PASSWORD = "password"
        const val KEY_REMOTE_PATH = "remote_path"
        const val KEY_LAST_SYNC = "last_sync"
        const val KEY_LAST_ETAG = "last_etag"
        const val WORK_NAME = "WebDavBackgroundSyncWork"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val enabled = prefs.getBoolean(KEY_ENABLED, false)
        val serverUrl = prefs.getString(KEY_SERVER_URL, "") ?: ""
        val username = prefs.getString(KEY_USERNAME, "") ?: ""
        val password = prefs.getString(KEY_PASSWORD, "") ?: ""
        val remotePath = prefs.getString(KEY_REMOTE_PATH, "/OxideDeck") ?: "/OxideDeck"

        if (!enabled || serverUrl.isBlank() || username.isBlank()) {
            Log.d(TAG, "WebDAV background sync skipped: not configured or disabled.")
            return@withContext Result.success()
        }

        try {
            val cleanBase = serverUrl.trimEnd('/')
            val cleanSub = remotePath.trimStart('/')
            val syncFileUrl = if (cleanSub.isNotBlank()) "$cleanBase/$cleanSub/oxide_deck_sync.json" else "$cleanBase/oxide_deck_sync.json"

            val url = URL(syncFileUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            val auth = "$username:$password"
            val authHeader = "Basic " + Base64.encodeToString(auth.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
            connection.setRequestProperty("Authorization", authHeader)
            connection.setRequestProperty("User-Agent", "OxideDeck-WorkManager/1.0")

            val responseCode = connection.responseCode
            val etag = connection.getHeaderField("ETag")
            val lastModified = connection.getHeaderField("Last-Modified")
            connection.disconnect()

            Log.d(TAG, "WebDAV background WorkManager sync executed successfully (Status: $responseCode, ETag: $etag, Last-Modified: $lastModified)")

            if (responseCode in 200..299) {
                prefs.edit()
                    .putString(KEY_LAST_SYNC, System.currentTimeMillis().toString())
                    .apply()
                if (!etag.isNullOrBlank()) {
                    prefs.edit().putString(KEY_LAST_ETAG, etag).apply()
                }
            }
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "WebDAV background WorkManager sync error: ${e.message}", e)
            Result.retry()
        }
    }
}
