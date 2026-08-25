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

export async function getStats(): Promise<Stats> {
  const db = await getDB();

  const totalRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM revision_history");
  const totalReviews = totalRes[0]?.count || 0;

  const avgRes = await db.select<{ avg_score: number | null }[]>("SELECT AVG(score) as avg_score FROM revision_history");
  const averageScore = Math.round(avgRes[0]?.avg_score || 0);

  const todayRes = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM revision_history WHERE date(reviewed_at) = date('now')"
  );
  const cardsReviewedToday = todayRes[0]?.count || 0;

  // Weekly breakdown (last 7 calendar days)
  const weeklyProgress = [];
  for (let i = 6; i >= 0; i--) {
    const dayRes = await db.select<{ count: number; avg_score: number | null }[]>(
      `SELECT COUNT(*) as count, AVG(score) as avg_score FROM revision_history WHERE date(reviewed_at) = date('now', '-${i} days')`
    );
    const dateStr = new Date();
    dateStr.setDate(dateStr.getDate() - i);
    const dayName = dateStr.toLocaleDateString('en-US', { weekday: 'short' });
    weeklyProgress.push({
      day: dayName,
      count: dayRes[0]?.count || 0,
      avg_score: Math.round(dayRes[0]?.avg_score || 0),
    });
  }

  // Load notification settings to check streakActiveDays and streak conditions
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

  // Calculate streak based on daily activities, minimum conditions, and active streak days
  let streakDays = 0;
  let checkDayOffset = 0;
  const MAX_CHECK_DAYS = 365;

  let streakProgressToday = 0;
  let streakConditionMetToday = false;

  while (checkDayOffset < MAX_CHECK_DAYS) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - checkDayOffset);
    const dayKey = DAY_INDEX_MAP[targetDate.getDay()];
    const isRequiredDay = streakActiveDays[dayKey] ?? true;

    // Fetch card and quiz activities for this day
    const flashcardRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM revision_history WHERE date(reviewed_at) = date('now', '-${checkDayOffset} days') AND (type = 'flashcard' OR type IS NULL)`
    );
    const flashcardCount = flashcardRes[0]?.count || 0;

    const quizRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM revision_history WHERE date(reviewed_at) = date('now', '-${checkDayOffset} days') AND (type = 'quiz' OR type = 'mock')`
    );
    const quizCount = quizRes[0]?.count || 0;

    const teachRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM revision_history WHERE date(reviewed_at) = date('now', '-${checkDayOffset} days') AND type = 'teach'`
    );
    const teachCount = teachRes[0]?.count || 0;

    const hasMetCards = flashcardCount >= streakMinCards;
    const hasMetQuiz = streakAllowQuizzes && quizCount > 0;
    const hasMetTeach = streakAllowTeachMode && teachCount > 0;
    const isCompleted = hasMetCards || hasMetQuiz || hasMetTeach;

    if (checkDayOffset === 0) {
      streakProgressToday = flashcardCount + (hasMetQuiz || hasMetTeach ? streakMinCards : 0);
      streakConditionMetToday = isCompleted;
    }

    if (isCompleted) {
      streakDays++;
      checkDayOffset++;
    } else {
      // If user did NOT meet streak condition on this day:
      // 1. Today (offset 0) has not met goal yet -> allow checking yesterday without breaking streak yet
      if (checkDayOffset === 0) {
        checkDayOffset++;
        continue;
      }

      // 2. Configured Rest Day (e.g. Saturday or Sunday) -> forgive the day, don't break streak!
      if (!isRequiredDay) {
        checkDayOffset++;
        continue;
      }

      // 3. Required study day with condition unmet -> streak breaks!
      break;
    }
  }

  const dueRes = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM flashcards WHERE datetime(next_review) <= datetime('now')"
  );
  const dueCardsCount = dueRes[0]?.count || 0;

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
  };
}
