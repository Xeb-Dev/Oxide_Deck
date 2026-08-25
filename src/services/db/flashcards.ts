import { getDB, generateUUID } from "./connection";
import type { Flashcard } from "./types";
import { cardFromRow, rowFromCard, getFSRS, ratingToScore, type Grade, type Rating } from "../fsrs";
import { addRevisionHistory } from "./revisionHistory";

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

export async function createFlashcard(
  deckId: string,
  front: string,
  back: string,
  tags: string | null = "",
  imageUrl: string | null = null,
  frontImageUrl: string | null = null,
  backImageUrl: string | null = null
): Promise<Flashcard> {
  const db = await getDB();
  const id = generateUUID();
  const now = new Date().toISOString();

  const fImg = frontImageUrl || imageUrl || null;
  const bImg = backImageUrl || null;

  await db.execute(
    "INSERT INTO flashcards (id, deck_id, front, back, tags, ease, interval_days, repetitions, next_review, created_at, stability, difficulty, state, reps, lapses, elapsed_days, scheduled_days, last_review, image_url, front_image_url, back_image_url) VALUES ($1, $2, $3, $4, $5, 2.5, 0, 0, $6, $7, 0, 0, 0, 0, 0, 0, 0, NULL, $8, $9, $10)",
    [id, deckId, front, back, tags, now, now, fImg, fImg, bImg]
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
    image_url: fImg,
    front_image_url: fImg,
    back_image_url: bImg,
  };
}

export async function updateFlashcard(
  id: string,
  front: string,
  back: string,
  tags: string | null,
  imageUrl: string | null = null,
  frontImageUrl: string | null = null,
  backImageUrl: string | null = null
): Promise<void> {
  const db = await getDB();
  const fImg = frontImageUrl || imageUrl || null;
  const bImg = backImageUrl || null;

  await db.execute(
    "UPDATE flashcards SET front = $1, back = $2, tags = $3, image_url = $4, front_image_url = $5, back_image_url = $6 WHERE id = $7",
    [front, back, tags, fImg, fImg, bImg, id]
  );
}

export async function deleteFlashcard(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

export async function moveFlashcardToDeck(cardId: string, deckId: string): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE flashcards SET deck_id = $1 WHERE id = $2", [deckId, cardId]);
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
  return db.select<(Flashcard & { deck_name: string })[]>(
    "SELECT f.*, d.name as deck_name FROM flashcards f JOIN decks d ON f.deck_id = d.id WHERE datetime(f.next_review) <= datetime('now') ORDER BY f.next_review ASC"
  );
}
