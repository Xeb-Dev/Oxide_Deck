import { getDB, generateUUID } from "./connection";
import type { Subject } from "./types";
import { triggerBackgroundSyncIfEnabled } from "../syncEngine";

export async function getSubjects(): Promise<Subject[]> {
  const db = await getDB();
  return db.select<Subject[]>("SELECT * FROM subjects ORDER BY name ASC");
}

export async function createSubject(
  name: string,
  icon: string | null = "📚",
  color: string | null = "#37352f"
): Promise<Subject> {
  const db = await getDB();
  const id = generateUUID();
  await db.execute(
    "INSERT INTO subjects (id, name, icon, color) VALUES ($1, $2, $3, $4)",
    [id, name, icon, color]
  );
  triggerBackgroundSyncIfEnabled("new subject");
  return { id, name, icon, color, created_at: new Date().toISOString() };
}

export async function updateSubject(
  id: string,
  name: string,
  icon: string | null,
  color: string | null
): Promise<void> {
  const db = await getDB();
  await db.execute(
    "UPDATE subjects SET name = $1, icon = $2, color = $3 WHERE id = $4",
    [name, icon, color, id]
  );
  triggerBackgroundSyncIfEnabled("update subject");
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("UPDATE folders SET subject_id = NULL WHERE subject_id = $1", [id]);
  await db.execute("DELETE FROM test_questions WHERE test_id IN (SELECT id FROM tests WHERE subject_id = $1)", [id]);
  await db.execute("DELETE FROM test_analyses WHERE subject_id = $1", [id]);
  await db.execute("DELETE FROM test_errors WHERE subject_id = $1", [id]);
  await db.execute("DELETE FROM tests WHERE subject_id = $1", [id]);
  await db.execute("DELETE FROM subjects WHERE id = $1", [id]);
  triggerBackgroundSyncIfEnabled("delete subject");
}

