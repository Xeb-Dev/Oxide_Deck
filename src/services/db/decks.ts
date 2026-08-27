import { getDB, generateUUID } from "./connection";
import type { Deck } from "./types";
import { triggerBackgroundSyncIfEnabled } from "../syncEngine";

export async function getDecks(): Promise<Deck[]> {
  const db = await getDB();
  return db.select<Deck[]>("SELECT * FROM decks ORDER BY name ASC");
}

export async function createDeck(
  name: string,
  folderId: string | null = null,
  icon: string | null = "🎴",
  description: string | null = ""
): Promise<Deck> {
  const db = await getDB();
  const id = generateUUID();
  await db.execute(
    "INSERT INTO decks (id, folder_id, name, icon, description) VALUES ($1, $2, $3, $4, $5)",
    [id, folderId, name, icon, description]
  );
  triggerBackgroundSyncIfEnabled("new deck");
  return { id, folder_id: folderId, name, icon, description, created_at: new Date().toISOString() };
}

export async function updateDeck(
  id: string,
  name: string,
  icon: string | null,
  description: string | null,
  folderId: string | null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE decks SET name = $1, icon = $2, description = $3, folder_id = $4 WHERE id = $5",
    [name, icon, description, folderId, id]
  );
  triggerBackgroundSyncIfEnabled("update deck");
}

export async function deleteDeck(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM decks WHERE id = $1", [id]);
  triggerBackgroundSyncIfEnabled("delete deck");
}

export async function updateDeckFolder(deckId: string, folderId: string | null): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE decks SET folder_id = $1 WHERE id = $2", [folderId, deckId]);
  triggerBackgroundSyncIfEnabled("move deck");
}
