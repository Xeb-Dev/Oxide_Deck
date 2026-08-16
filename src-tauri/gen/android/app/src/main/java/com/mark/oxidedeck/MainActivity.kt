package com.mark.oxidedeck

import android.content.Context
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  companion object {
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
  }
}
