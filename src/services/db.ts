import Database from "@tauri-apps/plugin-sql";
import { cardFromRow, rowFromCard, getFSRS, loadParameters, saveParameters, DEFAULT_W, ratingToScore, type Grade } from "./fsrs";
import type { Rating } from "./fsrs";

export interface Subject {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  subject_id: string | null;
  parent_folder_id: string | null;
  created_at: string;
}

export interface Deck {
  id: string;
  folder_id: string | null;
  name: string;
  icon: string | null;
  description: string | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  tags: string | null;
  /** @deprecated SM-2 ease factor — kept for rollback safety. Use `difficulty`/`stability`. */
  ease: number;
  /** @deprecated SM-2 interval — kept for rollback safety. Use `scheduled_days`. */
  interval_days: number;
  /** @deprecated SM-2 consecutive reps — kept for rollback safety. Use `reps`. */
  repetitions: number;
  /** ISO datetime of next due review. Source of truth for the due query. */
  next_review: string;
  created_at: string;
  // FSRS fields (added in migration v4)
  stability: number;
  difficulty: number;
  /** 0=New, 1=Learning, 2=Review, 3=Relearning */
  state: number;
  reps: number;
  lapses: number;
  elapsed_days: number;
  scheduled_days: number;
  last_review: string | null;
}

export interface RevisionHistory {
  id: string;
  flashcard_id: string | null;
  type: 'flashcard' | 'quiz';
  score: number;
  reviewed_at: string;
  /** FSRS Rating (1=Again, 2=Hard, 3=Good, 4=Easy). Null for legacy/quiz rows. */
  rating: number | null;
}

let dbInstance: Database | null = null;

export async function getDB(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:oxide_deck.db");
  }
  return dbInstance;
}

// Helper to generate UUIDs locally (since SQLite doesn't have a standard built-in UUID gen that works everywhere, we do it in JS)
export function generateUUID(): string {
  return crypto.randomUUID();
}

// SUBJECTS DB METHODS
export async function getSubjects(): Promise<Subject[]> {
  const db = await getDB();
  return db.select<Subject[]>("SELECT * FROM subjects ORDER BY name ASC");
}

export async function createSubject(name: string, icon: string | null = "📚", color: string | null = "#37352f"): Promise<Subject> {
  const db = await getDB();
  const id = generateUUID();
  await db.execute(
    "INSERT INTO subjects (id, name, icon, color) VALUES ($1, $2, $3, $4)",
    [id, name, icon, color]
  );
  return { id, name, icon, color, created_at: new Date().toISOString() };
}

export async function updateSubject(id: string, name: string, icon: string | null, color: string | null): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE subjects SET name = $1, icon = $2, color = $3 WHERE id = $4",
    [name, icon, color, id]
  );
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM subjects WHERE id = $1", [id]);
}

// FOLDERS DB METHODS
export async function getFolders(): Promise<Folder[]> {
  const db = await getDB();
  return db.select<Folder[]>("SELECT * FROM folders ORDER BY name ASC");
}

export async function createFolder(
  name: string,
  icon: string | null = "📁",
  color: string | null = "#37352f",
  subjectId: string | null = null,
  parentFolderId: string | null = null
): Promise<Folder> {
  const db = await getDB();
  const id = generateUUID();
  await db.execute(
    "INSERT INTO folders (id, name, icon, color, subject_id, parent_folder_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, name, icon, color, subjectId, parentFolderId]
  );
  return {
    id,
    name,
    icon,
    color,
    subject_id: subjectId,
    parent_folder_id: parentFolderId,
    created_at: new Date().toISOString(),
  };
}

export async function updateFolder(
  id: string,
  name: string,
  icon: string | null,
  color: string | null,
  subjectId: string | null = null,
  parentFolderId: string | null = null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE folders SET name = $1, icon = $2, color = $3, subject_id = $4, parent_folder_id = $5 WHERE id = $6",
    [name, icon, color, subjectId, parentFolderId, id]
  );
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  // Set related decks' folder_id to NULL due to ON DELETE SET NULL foreign key constraint
  await db.execute("DELETE FROM folders WHERE id = $1", [id]);
}

// DECKS DB METHODS
export async function getDecks(): Promise<Deck[]> {
  const db = await getDB();
  return db.select<Deck[]>("SELECT * FROM decks ORDER BY name ASC");
}

export async function createDeck(name: string, folderId: string | null = null, icon: string | null = "🎴", description: string | null = ""): Promise<Deck> {
  const db = await getDB();
  const id = generateUUID();
  await db.execute(
    "INSERT INTO decks (id, folder_id, name, icon, description) VALUES ($1, $2, $3, $4, $5)",
    [id, folderId, name, icon, description]
  );
  return { id, folder_id: folderId, name, icon, description, created_at: new Date().toISOString() };
}

export async function updateDeck(id: string, name: string, icon: string | null, description: string | null, folderId: string | null): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE decks SET name = $1, icon = $2, description = $3, folder_id = $4 WHERE id = $5",
    [name, icon, description, folderId, id]
  );
}

export async function deleteDeck(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM decks WHERE id = $1", [id]);
}

// FLASHCARDS DB METHODS
export async function getFlashcards(deckId: string): Promise<Flashcard[]> {
  const db = await getDB();
  return db.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE deck_id = $1 ORDER BY created_at DESC",
    [deckId]
  );
}

export async function getAllFlashcards(): Promise<Flashcard[]> {
  const db = await getDB();
  return db.select<Flashcard[]>("SELECT * FROM flashcards ORDER BY created_at DESC");
}

export async function createFlashcard(deckId: string, front: string, back: string, tags: string | null = ""): Promise<Flashcard> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO flashcards (id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at, stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days, last_review) VALUES ($1, $2, $3, $4, $5, 2.5, 0, 0, $6, $7, 0, 0, 0, 0, 0, 0, 0, NULL)",
    [id, deckId, front, back, tags, now, now]
  );
  return {
    id,
    deck_id: deckId,
    front,
    back,
    tags,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    next_review: now,
    created_at: now,
    stability: 0,
    difficulty: 0,
    state: 0,
    reps: 0,
    lapses: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    last_review: null,
  };
}

export async function updateFlashcard(id: string, front: string, back: string, tags: string | null): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE flashcards SET front = $1, back = $2, tags = $3 WHERE id = $4",
    [front, back, tags, id]
  );
}

export async function deleteFlashcard(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

// FSRS SPACED REPETITION ALGORITHM
// rating: 1=Again, 2=Hard, 3=Good, 4=Easy (ts-fsrs Rating enum)
export async function reviewFlashcard(id: string, rating: number): Promise<void> {
  const db = await getDB();
  const cardResults = await db.select<Flashcard[]>("SELECT * FROM flashcards WHERE id = $1", [id]);
  if (cardResults.length === 0) return;
  const row = cardResults[0];

  const f = await getFSRS(db);
  const card = cardFromRow(row);
  const now = new Date();
  const { card: updatedCard } = f.next(card, now, rating as Grade);
  const cols = rowFromCard(updatedCard);

  await db.execute(
    "UPDATE flashcards SET stability = $1, difficulty = $2, state = $3, reps = $4, lapses = $5, elapsed_days = $6, scheduled_days = $7, last_review = $8, next_review = $9 WHERE id = $10",
    [cols.stability, cols.difficulty, cols.state, cols.reps, cols.lapses, cols.elapsed_days, cols.scheduled_days, cols.last_review, cols.next_review, id]
  );

  await addRevisionHistory(id, 'flashcard', ratingToScore(rating as Rating), rating);
}

export async function getDueFlashcards(): Promise<(Flashcard & { deck_name: string })[]> {
  const db = await getDB();
  // Using SQLite date functions to fetch cards due right now or earlier
  return db.select<(Flashcard & { deck_name: string })[]>(
    "SELECT f.*, d.name as deck_name FROM flashcards f JOIN decks d ON f.deck_id = d.id WHERE datetime(f.next_review) <= datetime('now') ORDER BY f.next_review ASC"
  );
}

// REVISION HISTORY & STATS
export async function addRevisionHistory(flashcardId: string | null, type: 'flashcard' | 'quiz', score: number, rating: number | null = null): Promise<void> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO revision_history (id, flashcard_id, type, score, reviewed_at, rating) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, flashcardId, type, score, now, rating]
  );
}

export interface Stats {
  totalReviews: number;
  averageScore: number;
  cardsReviewedToday: number;
  streakDays: number;
  weeklyProgress: { day: string; count: number; avg_score: number }[];
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
    const dayRes = await db.select<{ count: number, avg_score: number | null }[]>(
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

  // Calculate streak based on daily activities
  let streakDays = 0;
  let checkDayOffset = 0;
  while (true) {
    const activeRes = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM revision_history WHERE date(reviewed_at) = date('now', '-${checkDayOffset} days')`
    );
    if (activeRes[0]?.count > 0) {
      streakDays++;
      checkDayOffset++;
    } else {
      // If we are checking "today" (offset 0) and it has 0, but "yesterday" (offset 1) had reviews, the streak is still alive
      if (checkDayOffset === 0) {
        checkDayOffset++;
        continue;
      }
      break;
    }
  }

  return {
    totalReviews,
    averageScore,
    cardsReviewedToday,
    streakDays,
    weeklyProgress,
  };
}

export async function resetDatabase(): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM revision_history");
  await db.execute("DELETE FROM flashcards");
  await db.execute("DELETE FROM decks");
  await db.execute("DELETE FROM folders");
}

export async function updateFolderSubject(folderId: string, subjectId: string | null): Promise<void> {
  const db = await getDB();
  // Assigning to a subject (or unassigned) makes the folder top-level
  await db.execute(
    "UPDATE folders SET subject_id = $1, parent_folder_id = NULL WHERE id = $2",
    [subjectId, folderId]
  );
}

export async function updateDeckFolder(deckId: string, folderId: string | null): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE decks SET folder_id = $1 WHERE id = $2", [folderId, deckId]);
}

/** Nest a folder under another folder (or clear parent). Inherits subject from the parent. */
export async function moveFolderToParent(
  folderId: string,
  parentFolderId: string | null,
  subjectId: string | null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE folders SET parent_folder_id = $1, subject_id = $2 WHERE id = $3",
    [parentFolderId, subjectId, folderId]
  );
}

export async function moveFlashcardToDeck(cardId: string, deckId: string): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE flashcards SET deck_id = $1 WHERE id = $2", [deckId, cardId]);
}

// FSRS PARAMETERS
export interface FsrsParametersInfo {
  w: number[];
  updatedAt: string | null;
  isDefault: boolean;
  reviewCount: number;
}

export async function getFSRSParameters(): Promise<FsrsParametersInfo> {
  const db = await getDB();
  const { w, updatedAt } = await loadParameters(db);
  const countRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM revision_history WHERE rating IS NOT NULL");
  const reviewCount = countRes[0]?.count || 0;
  const isDefault = updatedAt === null || JSON.stringify(w) === JSON.stringify([...DEFAULT_W]);
  return { w, updatedAt, isDefault, reviewCount };
}

/**
 * Optimize FSRS parameters from review history.
 *
 * NOTE: ts-fsrs (v4.x) does not ship a parameter optimizer. True FSRS parameter
 * optimization requires gradient descent over the review log and is not yet
 * implemented here. This function validates that enough rated reviews exist and,
 * if so, is a placeholder that keeps the current (or default) parameters and
 * reports the review count. A future iteration can wire in a dedicated optimizer.
 */
export async function optimizeFSRSParameters(): Promise<{ ok: boolean; message: string }> {
  const db = await getDB();
  const countRes = await db.select<{ count: number }[]>("SELECT COUNT(*) as count FROM revision_history WHERE rating IS NOT NULL");
  const reviewCount = countRes[0]?.count || 0;
  const MIN_REVIEWS = 1000;
  if (reviewCount < MIN_REVIEWS) {
    return {
      ok: false,
      message: `Insufficient data: ${reviewCount}/${MIN_REVIEWS} rated reviews. Optimization will be available once you have more review history.`,
    };
  }
  // Persist the default parameters as the "optimized" baseline for now.
  await saveParameters(db, [...DEFAULT_W]);
  return {
    ok: true,
    message: `Parameters updated based on ${reviewCount} reviews. (Optimizer is a placeholder — gradient-descent optimization is planned for a future release.)`,
  };
}

export async function resetFSRSParameters(): Promise<void> {
  const db = await getDB();
  await saveParameters(db, [...DEFAULT_W]);
}

// TESTS (real-life subject exams)
export interface Test {
  id: string;
  subject_id: string;
  name: string;
  description: string | null;
  source_type: 'manual' | 'text' | 'pdf' | 'image';
  source_data: string | null;
  score: number | null;
  max_score: number;
  test_date: string | null;
  /** Allocated time limit / duration in minutes (e.g. 60 or 90). */
  time_limit_minutes: number | null;
  created_at: string;
}

export type TestQuestionType = 'multiple-choice' | 'short-answer' | 'long-answer' | 'true-false' | 'maths';

export interface TestQuestion {
  id: string;
  test_id: string;
  type: TestQuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string | null;
  /** The student's answer as written on the test, if captured. */
  user_answer: string | null;
  score: number | null;
  /** Step-by-step mathematical working out or derivation, if applicable. */
  math_work: string | null;
  source_page: number | null;
  created_at: string;
}

export async function getTests(): Promise<Test[]> {
  const db = await getDB();
  return db.select<Test[]>("SELECT * FROM tests ORDER BY test_date DESC");
}

export async function getTestsBySubject(subjectId: string): Promise<Test[]> {
  const db = await getDB();
  return db.select<Test[]>("SELECT * FROM tests WHERE subject_id = $1 ORDER BY datetime(test_date) ASC", [subjectId]);
}

export async function getTest(id: string): Promise<Test | null> {
  const db = await getDB();
  const rows = await db.select<Test[]>("SELECT * FROM tests WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createTest(
  subjectId: string,
  name: string,
  description: string | null,
  sourceType: Test['source_type'],
  sourceData: string | null,
  score: number | null,
  maxScore: number,
  testDate: string | null,
  timeLimitMinutes: number | null = null
): Promise<Test> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO tests (id, subject_id, name, description, source_type, source_data, score, max_score, test_date, time_limit_minutes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [id, subjectId, name, description, sourceType, sourceData, score, maxScore, testDate, timeLimitMinutes, now]
  );
  return { id, subject_id: subjectId, name, description, source_type: sourceType, source_data: sourceData, score, max_score: maxScore, test_date: testDate, time_limit_minutes: timeLimitMinutes, created_at: now };
}

export async function updateTest(
  id: string,
  name: string,
  description: string | null,
  score: number | null,
  maxScore: number,
  testDate: string | null,
  timeLimitMinutes: number | null = null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE tests SET name = $1, description = $2, score = $3, max_score = $4, test_date = $5, time_limit_minutes = $6 WHERE id = $7",
    [name, description, score, maxScore, testDate, timeLimitMinutes, id]
  );
}

export async function deleteTest(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM tests WHERE id = $1", [id]);
}

export async function getTestQuestions(testId: string): Promise<TestQuestion[]> {
  const db = await getDB();
  const rows = await db.select<(Omit<TestQuestion, 'options'> & { options: string | null })[]>(
    "SELECT * FROM test_questions WHERE test_id = $1 ORDER BY created_at ASC",
    [testId]
  );
  return rows.map((r) => ({
    ...r,
    options: r.options ? (JSON.parse(r.options) as string[]) : null,
  }));
}

export async function createTestQuestion(
  testId: string,
  type: TestQuestionType,
  question: string,
  options: string[] | null,
  correctAnswer: string | null,
  userAnswer: string | null = null,
  score: number | null = null,
  mathWork: string | null = null,
  sourcePage: number | null = null
): Promise<void> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO test_questions (id, test_id, type, question, options, correct_answer, user_answer, score, math_work, source_page, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    [id, testId, type, question, options ? JSON.stringify(options) : null, correctAnswer, userAnswer, score, mathWork, sourcePage, now]
  );
}

export async function deleteTestQuestions(testId: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM test_questions WHERE test_id = $1", [testId]);
}

export async function bulkCreateTestQuestions(
  testId: string,
  questions: { type: TestQuestionType; question: string; options: string[] | null; correctAnswer: string | null; userAnswer?: string | null; score?: number | null; mathWork?: string | null; sourcePage: number | null }[]
): Promise<void> {
  for (const q of questions) {
    await createTestQuestion(testId, q.type, q.question, q.options, q.correctAnswer, q.userAnswer ?? null, q.score ?? null, q.mathWork ?? null, q.sourcePage);
  }
}

export interface TestTrendPoint {
  test_date: string;
  scorePct: number;
  testName: string;
}

export async function getSubjectTestTrend(subjectId: string): Promise<TestTrendPoint[]> {
  const db = await getDB();
  const rows = await db.select<{ id: string; name: string; test_date: string; score: number; max_score: number }[]>(
    "SELECT id, name, test_date, score, max_score FROM tests WHERE subject_id = $1 AND score IS NOT NULL AND test_date IS NOT NULL ORDER BY datetime(test_date) ASC",
    [subjectId]
  );
  return rows.map((r) => ({
    test_date: r.test_date,
    scorePct: r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0,
    testName: r.name,
  }));
}

export interface TestAnalysis {
  id: string;
  test_id: string;
  subject_id: string;
  summary: string;
  strengths: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  created_at: string;
}

export interface TestError {
  id: string;
  test_id: string;
  subject_id: string;
  question_id: string | null;
  question_text: string;
  user_answer: string | null;
  correct_answer: string | null;
  error_reason: string;
  score: number | null;
  created_at: string;
  test_name?: string;
  subject_name?: string;
}

export async function saveTestAnalysis(
  testId: string,
  subjectId: string,
  summary: string,
  strengths: string | null,
  weaknesses: string | null,
  recommendations: string | null,
  errors: { questionId?: string | null; questionText: string; userAnswer?: string | null; correctAnswer?: string | null; errorReason: string; score?: number | null }[]
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();

  // Clean up existing analysis & errors for this test before re-analyzing
  await db.execute("DELETE FROM test_analyses WHERE test_id = $1", [testId]);
  await db.execute("DELETE FROM test_errors WHERE test_id = $1", [testId]);

  const analysisId = generateUUID();
  await db.execute(
    "INSERT INTO test_analyses (id, test_id, subject_id, summary, strengths, weaknesses, recommendations, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [analysisId, testId, subjectId, summary, strengths, weaknesses, recommendations, now]
  );

  for (const err of errors) {
    const errorId = generateUUID();
    await db.execute(
      "INSERT INTO test_errors (id, test_id, subject_id, question_id, question_text, user_answer, correct_answer, error_reason, score, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [errorId, testId, subjectId, err.questionId ?? null, err.questionText, err.userAnswer ?? null, err.correctAnswer ?? null, err.errorReason, err.score ?? null, now]
    );
  }
}

export async function getTestErrors(subjectId?: string): Promise<TestError[]> {
  const db = await getDB();
  let query = `
    SELECT e.*, t.name as test_name, s.name as subject_name
    FROM test_errors e
    LEFT JOIN tests t ON e.test_id = t.id
    LEFT JOIN subjects s ON e.subject_id = s.id
  `;
  const params: any[] = [];
  if (subjectId && subjectId !== 'all') {
    query += " WHERE e.subject_id = $1";
    params.push(subjectId);
  }
  query += " ORDER BY datetime(e.created_at) DESC";
  return await db.select<TestError[]>(query, params);
}

export async function getTestAnalysisByTestId(testId: string): Promise<TestAnalysis | null> {
  const db = await getDB();
  const rows = await db.select<TestAnalysis[]>("SELECT * FROM test_analyses WHERE test_id = $1 LIMIT 1", [testId]);
  return rows.length > 0 ? rows[0] : null;
}
