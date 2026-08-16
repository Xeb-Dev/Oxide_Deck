import { invoke } from "@tauri-apps/api/core";

export interface WidgetSyncData {
  streakDays: number;
  progressToday: number;
  targetToday: number;
  conditionMet: boolean;
  dueCardsCount: number;
}

export async function syncNativeWidget(data: WidgetSyncData): Promise<void> {
  try {
    await invoke("update_widget_data", {
      streakDays: Math.floor(data.streakDays),
      progressToday: Math.floor(data.progressToday),
      targetToday: Math.floor(data.targetToday),
      conditionMet: Boolean(data.conditionMet),
      dueCardsCount: Math.floor(data.dueCardsCount),
    });
  } catch (e) {
    // In web preview or non-mobile targets, this is a graceful no-op
    console.debug("Widget sync skipped or unsupported:", e);
  }
}
