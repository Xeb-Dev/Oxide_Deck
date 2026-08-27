import Database from "@tauri-apps/plugin-sql";

let dbInstance: Database | null = null;

export async function getDB(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:oxide_deck.db");
    try {
      await dbInstance.execute("PRAGMA journal_mode = WAL;");
      await dbInstance.execute("PRAGMA busy_timeout = 5000;");
      await dbInstance.execute("PRAGMA synchronous = NORMAL;");
    } catch (e) {
      console.warn("Could not set SQLite pragmas:", e);
    }
  }
  return dbInstance;
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
