import { getDB, generateUUID } from "./connection";
import type { Stats } from "./types";
import { syncNativeWidget } from "../widgetService";

export async function addRevisionHistory(
  flashcardId: string | null,
  type: 'flashcard' | 'quiz' | 'mock' | 'teach',
  score: number,
  rating: number | null = null
): Promise<void> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO revision_history (id, flashcard_id, type, score, reviewed_at, rating) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, flashcardId, type, score, now, rating]
  );
  // Asynchronously trigger stats recalculation and native widget synchronization
  setTimeout(() => {
    getStats().catch(() => {});
  }, 50);
}

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function getStats(): Promise<Stats> {
  const db = await getDB();

  // 1. Single aggregate query for total reviews and average score
  const summaryRes = await db.select<{ total_reviews: number; avg_score: number | null }[]>(
    "SELECT COUNT(*) as total_reviews, AVG(score) as avg_score FROM revision_history"
  );
  const totalReviews = summaryRes[0]?.total_reviews || 0;
  const averageScore = Math.round(summaryRes[0]?.avg_score || 0);

  // 2. Single aggregate query for due cards count
  const dueRes = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM flashcards WHERE datetime(next_review) <= datetime('now')"
  );
  const dueCardsCount = dueRes[0]?.count || 0;

  // 3. Single aggregate query for all daily breakdown (day, total_count, avg_score, flashcards, quizzes, teaches)
  const dailyRows = await db.select<{
    day: string;
    total_count: number;
    avg_score: number | null;
    flashcards: number;
    quizzes: number;
    teaches: number;
  }[]>(
    `SELECT 
      date(reviewed_at, 'localtime') as day,
      COUNT(*) as total_count,
      AVG(score) as avg_score,
      COUNT(CASE WHEN type = 'flashcard' OR type IS NULL THEN 1 END) as flashcards,
      COUNT(CASE WHEN type = 'quiz' OR type = 'mock' THEN 1 END) as quizzes,
      COUNT(CASE WHEN type = 'teach' THEN 1 END) as teaches
     FROM revision_history 
     GROUP BY date(reviewed_at, 'localtime')`
  );

  const dailyMap = new Map<string, {
    total_count: number;
    avg_score: number;
    flashcards: number;
    quizzes: number;
    teaches: number;
  }>();

  dailyRows.forEach((r) => {
    dailyMap.set(r.day, {
      total_count: r.total_count || 0,
      avg_score: Math.round(r.avg_score || 0),
      flashcards: r.flashcards || 0,
      quizzes: r.quizzes || 0,
      teaches: r.teaches || 0,
    });
  });

  const todayStr = toLocalDateString(new Date());
  const todayStats = dailyMap.get(todayStr);
  const cardsReviewedToday = todayStats?.total_count || 0;

  // 4. Weekly breakdown (last 7 calendar days for velocity chart) computed in-memory
  const weeklyProgress = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = toLocalDateString(d);
    const dayData = dailyMap.get(dayStr);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    weeklyProgress.push({
      day: dayName,
      count: dayData?.total_count || 0,
      avg_score: dayData?.avg_score || 0,
    });
  }

  // 5. Load notification settings to check streakActiveDays and streak conditions
  let streakActiveDays: Record<string, boolean> = {
    mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
  };
  let streakMinCards = 1;
  let streakAllowQuizzes = true;
  let streakAllowTeachMode = true;

  try {
    const raw = localStorage.getItem("oxide_deck_notification_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.streakActiveDays) streakActiveDays = parsed.streakActiveDays;
      if (typeof parsed.streakMinCards === 'number' && parsed.streakMinCards >= 1) {
        streakMinCards = parsed.streakMinCards;
      }
      if (typeof parsed.streakAllowQuizzes === 'boolean') streakAllowQuizzes = parsed.streakAllowQuizzes;
      if (typeof parsed.streakAllowTeachMode === 'boolean') streakAllowTeachMode = parsed.streakAllowTeachMode;
    }
  } catch {
    // fallback defaults
  }

  const DAY_INDEX_MAP: Record<number, string> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
  };

  // 6. 7-Day Consistency Matrix for current Monday-Sunday calendar week computed in-memory
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 1 = Tue, ..., 6 = Sun
  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() - currentDayOfWeek);
  mondayDate.setHours(0, 0, 0, 0);

  const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const WEEK_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const currentWeekMatrix: Stats['currentWeekMatrix'] = [];

  for (let idx = 0; idx < 7; idx++) {
    const dayDate = new Date(mondayDate);
    dayDate.setDate(mondayDate.getDate() + idx);
    const dayStr = toLocalDateString(dayDate);
    const dayKey = WEEK_KEYS[idx];
    const isToday = idx === currentDayOfWeek;
    const isPast = idx < currentDayOfWeek;
    const isFuture = idx > currentDayOfWeek;

    const dayActs = dailyMap.get(dayStr);
    const fc = dayActs?.flashcards || 0;
    const qz = dayActs?.quizzes || 0;
    const tc = dayActs?.teaches || 0;
    const totalCount = dayActs?.total_count || 0;

    const hasMetQuiz = streakAllowQuizzes && qz > 0;
    const hasMetTeach = streakAllowTeachMode && tc > 0;

    const isCompleted = isToday 
      ? (fc >= streakMinCards || hasMetQuiz || hasMetTeach)
      : (fc > 0 || hasMetQuiz || hasMetTeach);

    currentWeekMatrix.push({
      dayKey,
      dayLabel: WEEK_LABELS[idx],
      fullDate: dayStr,
      isToday,
      isPast,
      isFuture,
      isCompleted,
      count: totalCount,
    });
  }

  // 7. Calculate streak in pure in-memory JavaScript loop (0 DB calls!)
  let streakDays = 0;
  let checkDayOffset = 0;
  const MAX_CHECK_DAYS = 365;

  let streakProgressToday = 0;
  let streakConditionMetToday = false;

  while (checkDayOffset < MAX_CHECK_DAYS) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - checkDayOffset);
    const targetDateStr = toLocalDateString(targetDate);
    const dayKey = DAY_INDEX_MAP[targetDate.getDay()];
    const isRequiredDay = streakActiveDays[dayKey] ?? true;

    const dayActs = dailyMap.get(targetDateStr);
    const flashcardCount = dayActs?.flashcards || 0;
    const quizCount = dayActs?.quizzes || 0;
    const teachCount = dayActs?.teaches || 0;

    const hasMetQuiz = streakAllowQuizzes && quizCount > 0;
    const hasMetTeach = streakAllowTeachMode && teachCount > 0;

    if (checkDayOffset === 0) {
      const hasMetCards = flashcardCount >= streakMinCards;
      const isCompletedToday = hasMetCards || hasMetQuiz || hasMetTeach;

      streakProgressToday = flashcardCount + (hasMetQuiz || hasMetTeach ? streakMinCards : 0);
      streakConditionMetToday = isCompletedToday;

      if (isCompletedToday) {
        streakDays++;
      }
      checkDayOffset++;
    } else {
      const isCompletedPast = (flashcardCount > 0) || hasMetQuiz || hasMetTeach;

      if (isCompletedPast) {
        streakDays++;
        checkDayOffset++;
      } else {
        if (!isRequiredDay) {
          checkDayOffset++;
          continue;
        }
        break;
      }
    }
  }

  syncNativeWidget({
    streakDays,
    progressToday: streakProgressToday,
    targetToday: streakMinCards,
    conditionMet: streakConditionMetToday,
    dueCardsCount,
  }).catch(() => {});

  return {
    totalReviews,
    averageScore,
    cardsReviewedToday,
    streakDays,
    streakTargetToday: streakMinCards,
    streakProgressToday,
    streakConditionMetToday,
    weeklyProgress,
    currentWeekMatrix,
  };
}
