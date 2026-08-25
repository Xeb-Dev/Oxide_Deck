import { getDB, generateUUID } from "./connection";
import type { Subject } from "./types";

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
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await getDB();
  await db.execute("DELETE FROM subjects WHERE id = $1", [id]);
}
