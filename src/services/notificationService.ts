export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DaySchedule {
  enabled: boolean;
  time: string; // "HH:MM", e.g. "20:30"
}

export type WeeklyReminderSchedule = Record<DayOfWeek, DaySchedule>;
export type WeeklyStreakSchedule = Record<DayOfWeek, boolean>;

export type StreakConditionPreset = 'casual' | 'balanced' | 'serious' | 'custom';

export interface NotificationSettings {
  masterEnabled: boolean;
  dailyReminderEnabled: boolean;
  weeklySchedule: WeeklyReminderSchedule;
  streakActiveDays: WeeklyStreakSchedule;
  streakConditionPreset: StreakConditionPreset;
  streakMinCards: number; // e.g. 1 (casual), 5 (balanced), 15 (serious), or custom number
  streakAllowQuizzes: boolean; // default true
  streakAllowTeachMode: boolean; // default true
  dueCardsThresholdEnabled: boolean;
  dueCardsThresholdCount: number; // e.g. 10
  streakSaverEnabled: boolean;
  streakSaverTime: string; // "HH:MM", e.g. "21:30"
  leechWarningEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:MM", e.g. "22:00"
  quietHoursEnd: string; // "HH:MM", e.g. "07:00"
  soundEnabled: boolean;
  inAppToastEnabled: boolean;
}

export const DAY_KEYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_INDEX_MAP: Record<number, DayOfWeek> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

export const DAY_LABELS: Record<DayOfWeek, { short: string; full: string }> = {
  mon: { short: 'M', full: 'Monday' },
  tue: { short: 'T', full: 'Tuesday' },
  wed: { short: 'W', full: 'Wednesday' },
  thu: { short: 'T', full: 'Thursday' },
  fri: { short: 'F', full: 'Friday' },
  sat: { short: 'S', full: 'Saturday' },
  sun: { short: 'S', full: 'Sunday' },
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  masterEnabled: true,
  dailyReminderEnabled: true,
  weeklySchedule: {
    mon: { enabled: true, time: "20:30" },
    tue: { enabled: true, time: "20:30" },
    wed: { enabled: true, time: "20:30" },
    thu: { enabled: true, time: "20:30" },
    fri: { enabled: true, time: "20:30" },
    sat: { enabled: true, time: "10:30" },
    sun: { enabled: true, time: "10:30" },
  },
  streakActiveDays: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: true, // Default to true, customizable by user
    sun: true,
  },
  streakConditionPreset: 'casual',
  streakMinCards: 1,
  streakAllowQuizzes: true,
  streakAllowTeachMode: true,
  dueCardsThresholdEnabled: true,
  dueCardsThresholdCount: 10,
  streakSaverEnabled: true,
  streakSaverTime: "21:30",
  leechWarningEnabled: true,
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  soundEnabled: true,
  inAppToastEnabled: true,
};

const STORAGE_KEY = "oxide_deck_notification_settings";
const LAST_NOTIFIED_KEY = "oxide_deck_last_notified_dates";

interface LastNotifiedDates {
  dailyReminder?: string; // YYYY-MM-DD
  dueThreshold?: string; // YYYY-MM-DD
  streakSaver?: string; // YYYY-MM-DD
  leechWarning?: string; // YYYY-MM-DD
}

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
      weeklySchedule: {
        ...DEFAULT_NOTIFICATION_SETTINGS.weeklySchedule,
        ...(parsed.weeklySchedule || {}),
      },
      streakActiveDays: {
        ...DEFAULT_NOTIFICATION_SETTINGS.streakActiveDays,
        ...(parsed.streakActiveDays || {}),
      },
    };
  } catch (e) {
    console.error("Failed to load notification settings:", e);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save notification settings:", e);
  }
}

function getLastNotifiedDates(): LastNotifiedDates {
  try {
    const raw = localStorage.getItem(LAST_NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLastNotifiedDate(key: keyof LastNotifiedDates, dateStr: string): void {
  try {
    const current = getLastNotifiedDates();
    current[key] = dateStr;
    localStorage.setItem(LAST_NOTIFIED_KEY, JSON.stringify(current));
  } catch (e) {
    console.error("Failed to set last notified date:", e);
  }
}

// In-app toast listeners
type ToastListener = (toast: { title: string; body: string; type?: 'info' | 'warning' | 'success' }) => void;
const toastListeners: Set<ToastListener> = new Set();

export function subscribeToToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export function emitToast(title: string, body: string, type: 'info' | 'warning' | 'success' = 'info'): void {
  toastListeners.forEach(listener => listener({ title, body, type }));
}

async function getTauriNotificationPlugin(): Promise<any | null> {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.__TAURI__?.notification) return w.__TAURI__.notification;
  try {
    const notif = await new Function('return import("@tauri-apps/plugin-notification")')();
    return notif;
  } catch {
    return null;
  }
}

/**
 * Request notification permissions from native API or Web Notification API
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.location && window.location.protocol === "about:") return false;

  // 1. Try native Tauri OS notification plugin first (Android / Desktop native permission dialog)
  try {
    const tauriNotif = await getTauriNotificationPlugin();
    if (tauriNotif) {
      let isGranted = await tauriNotif.isPermissionGranted();
      if (!isGranted) {
        const permission = await tauriNotif.requestPermission();
        isGranted = permission === "granted";
      }
      if (isGranted) return true;
    }
  } catch (e) {
    console.warn("Tauri notification plugin error:", e);
  }

  // 2. Fallback to standard Web Notification API if not in native Tauri context
  if ("Notification" in window) {
    if (Notification.permission === "granted") return true;
    if (Notification.permission !== "denied") {
      const perm = await Notification.requestPermission();
      return perm === "granted";
    }
  }

  return false;
}

/**
 * Check if the current time falls within Quiet Hours (Do Not Disturb)
 */
export function isQuietHours(settings: NotificationSettings = getNotificationSettings()): boolean {
  if (!settings.quietHoursEnabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = settings.quietHoursStart.split(":").map(Number);
  const [endH, endM] = settings.quietHoursEnd.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Sends a native system notification and/or in-app toast
 */
export async function triggerNotification(
  title: string,
  body: string,
  type: 'info' | 'warning' | 'success' = 'info'
): Promise<boolean> {
  const settings = getNotificationSettings();
  if (!settings.masterEnabled) return false;

  let shown = false;

  if (settings.inAppToastEnabled) {
    emitToast(title, body, type);
    shown = true;
  }

  if (isQuietHours(settings)) {
    console.log("Notification suppressed due to Quiet Hours (DND)");
    return shown;
  }

  if (settings.soundEnabled && typeof Audio !== "undefined") {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio context restricted before user interaction
    }
  }

  try {
    const tauriNotif = await getTauriNotificationPlugin();
    if (tauriNotif && await tauriNotif.isPermissionGranted()) {
      tauriNotif.sendNotification({ title, body });
      shown = true;
    }
  } catch {
    // Fallback to Web Notification API
  }

  if (!shown && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/icon.png" });
      shown = true;
    } catch (e) {
      console.warn("Failed to send web notification:", e);
    }
  }

  return shown;
}

/**
 * Core notification engine: checks database due cards & user activity to trigger study notifications.
 * Ensures notifications only fire once per day and only one relevant notification per check.
 */
export async function checkAndTriggerStudyReminders(
  dueCardsCount: number,
  todayReviewedCount: number = 0,
  leechCardsCount: number = 0
): Promise<{ triggered: boolean; type?: string }> {
  const settings = getNotificationSettings();
  if (!settings.masterEnabled) return { triggered: false };

  const todayStr = new Date().toISOString().split("T")[0];
  const lastNotified = getLastNotifiedDates();
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayDayKey = DAY_INDEX_MAP[now.getDay()];
  const todaySchedule = settings.weeklySchedule[todayDayKey];

  // 1. Due Cards Threshold Notification (once per day)
  if (
    settings.dueCardsThresholdEnabled &&
    dueCardsCount >= settings.dueCardsThresholdCount &&
    lastNotified.dueThreshold !== todayStr
  ) {
    setLastNotifiedDate("dueThreshold", todayStr);
    await triggerNotification(
      "📚 Flashcards Ready for Review",
      `You have ${dueCardsCount} cards waiting for review. Great time for a study session!`,
      "info"
    );
    return { triggered: true, type: "dueThreshold" };
  }

  // 2. Daily Study Reminder Notification (per-day schedule, once per day)
  if (
    settings.dailyReminderEnabled &&
    todaySchedule?.enabled &&
    currentHHMM >= todaySchedule.time &&
    lastNotified.dailyReminder !== todayStr &&
    todayReviewedCount === 0
  ) {
    setLastNotifiedDate("dailyReminder", todayStr);
    await triggerNotification(
      "⏰ Daily Study Time!",
      dueCardsCount > 0
        ? `You have ${dueCardsCount} cards due today. Keep your memory sharp!`
        : `Ready to learn new flashcards today?`,
      "info"
    );
    return { triggered: true, type: "dailyReminder" };
  }

  // 3. Streak Saver / Evening Alert (only on required streak study days, once per day)
  const targetCards = settings.streakMinCards || 1;
  if (
    settings.streakSaverEnabled &&
    settings.streakActiveDays[todayDayKey] &&
    currentHHMM >= settings.streakSaverTime &&
    lastNotified.streakSaver !== todayStr &&
    todayReviewedCount < targetCards
  ) {
    setLastNotifiedDate("streakSaver", todayStr);
    const remaining = targetCards - todayReviewedCount;
    const msg = remaining > 1
      ? `You have reviewed ${todayReviewedCount}/${targetCards} cards today. Review ${remaining} more before midnight to keep your streak!`
      : `You haven't completed your daily study goal today. Complete a quick review session before midnight to keep your streak!`;

    await triggerNotification(
      "🔥 Don't Break Your Streak!",
      msg,
      "warning"
    );
    return { triggered: true, type: "streakSaver" };
  }

  // 4. Leech / Optimal Retention Warning (once per day)
  if (
    settings.leechWarningEnabled &&
    leechCardsCount > 0 &&
    lastNotified.leechWarning !== todayStr
  ) {
    setLastNotifiedDate("leechWarning", todayStr);
    await triggerNotification(
      "🎯 Optimal Retention Alert",
      `${leechCardsCount} difficult flashcard(s) are due right now for maximum memory retention.`,
      "warning"
    );
    return { triggered: true, type: "leechWarning" };
  }

  return { triggered: false };
}
