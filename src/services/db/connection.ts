import Database from "@tauri-apps/plugin-sql";
import { logger } from "../logger";

let dbPromise: Promise<Database> | null = null;

export async function getDB(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:oxide_deck.db");
      logger.info("Database", "SQLite database connection loaded successfully");
      try {
        await db.execute("PRAGMA journal_mode = WAL;");
        await db.execute("PRAGMA busy_timeout = 5000;");
        await db.execute("PRAGMA synchronous = NORMAL;");
        logger.info("Database", "Configured SQLite pragmas (WAL mode, busy_timeout=5000ms)");
      } catch (e) {
        logger.warn("Database", "Could not set SQLite pragmas", e);
      }
      return db;
    })();
  }
  return dbPromise;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export async function resetDatabase(): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM revision_history");
  await db.execute("DELETE FROM flashcards");
  await db.execute("DELETE FROM decks");
  await db.execute("DELETE FROM folders");
}
