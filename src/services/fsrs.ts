import { fsrs, generatorParameters, Rating, State, type Card, type FSRS, type FSRSParameters, type Grade } from "ts-fsrs";
import DatabaseType from "@tauri-apps/plugin-sql";
import type { Flashcard } from "./db";

type Database = InstanceType<typeof DatabaseType>;

export { Rating, State };
export type { Grade };

/** Default FSRS w parameters (FSRS-4.5). Mirrored in the v4 SQL migration. */
export const DEFAULT_W: readonly number[] = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61,
];

/** FSRS config used across the app: 90% retention, 365-day max interval, fuzzing on. */
const APP_FSRS_CONFIG: Partial<FSRSParameters> = {
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
};

interface FsrsParametersRow {
  id: number;
  params: string | null;
  updated_at: string | null;
}

/**
 * Load the persisted FSRS parameters (w array) from the fsrs_parameters table.
 * Falls back to DEFAULT_W if the row is missing or unparseable.
 */
export async function loadParameters(db: Database): Promise<{ w: number[]; updatedAt: string | null }> {
  const rows = await db.select<FsrsParametersRow[]>("SELECT id, params, updated_at FROM fsrs_parameters WHERE id = 1");
  if (rows.length === 0 || !rows[0].params) {
    return { w: [...DEFAULT_W], updatedAt: null };
  }
  try {
    const parsed = JSON.parse(rows[0].params);
    if (Array.isArray(parsed) && parsed.length >= 17) {
      return { w: parsed, updatedAt: rows[0].updated_at };
    }
  } catch {
    // fall through
  }
  return { w: [...DEFAULT_W], updatedAt: rows[0]?.updated_at ?? null };
}

/** Persist a w array to the fsrs_parameters table (upsert row id=1). */
export async function saveParameters(db: Database, w: number[]): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO fsrs_parameters (id, params, updated_at) VALUES (1, $1, $2) ON CONFLICT(id) DO UPDATE SET params = $1, updated_at = $2",
    [JSON.stringify(w), now]
  );
}

/** Build an FSRS instance from the persisted parameters, with the app-wide config applied. */
export async function getFSRS(db: Database): Promise<FSRS> {
  const { w } = await loadParameters(db);
  return fsrs({ ...APP_FSRS_CONFIG, w });
}

/** Build an FSRS instance from the default w (no DB read). */
export function getDefaultFSRS(): FSRS {
  return fsrs({ ...APP_FSRS_CONFIG, w: [...DEFAULT_W] });
}

/**
 * Map a DB flashcard row into a ts-fsrs Card. Treats `next_review` as `due`.
 * Applies a defensive legacy migration heuristic for cards that have SM-2
 * state but no FSRS state (in case the v4 backfill didn't run).
 */
export function cardFromRow(row: Flashcard): Card {
  const now = new Date();
  const due = row.next_review ? new Date(row.next_review) : new Date(now);
  const lastReview = row.last_review ? new Date(row.last_review) : undefined;

  // Defensive legacy migration: if state is 0 (New) but the card has SM-2
  // repetitions, treat it as a Review card with stability from interval_days.
  let state: State = (row.state ?? 0) as State;
  let stability = row.stability ?? 0;
  let difficulty = row.difficulty ?? 0;
  let reps = row.reps ?? 0;
  let lapses = row.lapses ?? 0;
  let scheduledDays = row.scheduled_days ?? 0;

  if ((state === State.New) && (row.repetitions ?? 0) > 0) {
    state = State.Review;
    stability = Math.max(row.interval_days ?? 0, 1);
    difficulty = Math.min(10, Math.max(1, (2.5 - (row.ease ?? 2.5)) * 10 + 5));
    reps = row.repetitions ?? 0;
    scheduledDays = row.interval_days ?? 0;
  }

  const elapsedDays = lastReview
    ? Math.max(0, Math.round((now.getTime() - lastReview.getTime()) / 86_400_000))
    : 0;

  return {
    due,
    stability,
    difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    reps,
    lapses,
    state,
    last_review: lastReview,
  };
}

/** Inverse of cardFromRow: produce DB column values from an updated ts-fsrs Card. */
export function rowFromCard(card: Card): {
  stability: number;
  difficulty: number;
  state: number;
  reps: number;
  lapses: number;
  elapsed_days: number;
  scheduled_days: number;
  last_review: string | null;
  next_review: string;
} {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    last_review: card.last_review ? card.last_review.toISOString() : null,
    next_review: card.due.toISOString(),
  };
}

/** Map an FSRS Rating to a 0–100 score for revision_history.score (legacy column). */
export function ratingToScore(rating: Rating): number {
  switch (rating) {
    case Rating.Again: return 0;
    case Rating.Hard: return 50;
    case Rating.Good: return 80;
    case Rating.Easy: return 100;
    default: return 0;
  }
}

/** Map an AI 0–100 validation score to an FSRS Rating. */
export function scoreToRating(score: number): Rating {
  if (score >= 90) return Rating.Easy;
  if (score >= 70) return Rating.Good;
  if (score >= 40) return Rating.Hard;
  return Rating.Again;
}

/** Human-readable label for a card state integer. */
export function stateLabel(state: number | null | undefined): string {
  switch (state) {
    case State.New: return "New";
    case State.Learning: return "Learning";
    case State.Review: return "Review";
    case State.Relearning: return "Relearning";
    default: return "New";
  }
}

export { generatorParameters };
