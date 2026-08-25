import { getDB, generateUUID } from "./connection";
import type { Folder } from "./types";

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

export async function updateFolderSubject(folderId: string, subjectId: string | null): Promise<void> {
  const db = await getDB();
  // Assigning to a subject (or unassigned) makes the folder top-level
  await db.execute(
    "UPDATE folders SET subject_id = $1, parent_folder_id = NULL WHERE id = $2",
    [subjectId, folderId]
  );
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
