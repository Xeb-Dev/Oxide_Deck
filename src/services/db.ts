import Database from "@tauri-apps/plugin-sql";

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
  ease: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  created_at: string;
}

export interface RevisionHistory {
  id: string;
  flashcard_id: string | null;
  type: 'flashcard' | 'quiz';
  score: number;
  reviewed_at: string;
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
    "INSERT INTO flashcards (id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at) VALUES ($1, $2, $3, $4, $5, 2.5, 0, 0, $6, $7)",
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
    created_at: now
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

// SM2 SPACED REPETITION ALGORITHM
// Grade: 0 (forgot) to 5 (perfect recall)
export async function reviewFlashcard(id: string, grade: number): Promise<void> {
  const db = await getDB();
  const cardResults = await db.select<Flashcard[]>("SELECT * FROM flashcards WHERE id = $1", [id]);
  if (cardResults.length === 0) return;
  const card = cardResults[0];

  let { ease, interval_days, repetitions } = card;

  if (grade >= 3) {
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.ceil(interval_days * ease);
    }
    repetitions++;
  } else {
    repetitions = 0;
    interval_days = 1;
  }

  // Calculate new ease factor: EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval_days);
  const next_review = nextReviewDate.toISOString();

  await db.execute(
    "UPDATE flashcards SET ease = $1, interval_days = $2, repetitions = $3, next_review = $4 WHERE id = $5",
    [ease, interval_days, repetitions, next_review, id]
  );

  // Insert review history (mapped to 0-100 score: grade * 20)
  await addRevisionHistory(id, 'flashcard', grade * 20);
}

export async function getDueFlashcards(): Promise<(Flashcard & { deck_name: string })[]> {
  const db = await getDB();
  // Using SQLite date functions to fetch cards due right now or earlier
  return db.select<(Flashcard & { deck_name: string })[]>(
    "SELECT f.*, d.name as deck_name FROM flashcards f JOIN decks d ON f.deck_id = d.id WHERE datetime(f.next_review) <= datetime('now') ORDER BY f.next_review ASC"
  );
}

// REVISION HISTORY & STATS
export async function addRevisionHistory(flashcardId: string | null, type: 'flashcard' | 'quiz', score: number): Promise<void> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO revision_history (id, flashcard_id, type, score, reviewed_at) VALUES ($1, $2, $3, $4, $5)",
    [id, flashcardId, type, score, now]
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
