import type { Folder } from "../services/db";

/** Top-level folders for a subject (or unassigned when subjectId is null). */
export function getRootFolders(folders: Folder[], subjectId: string | null): Folder[] {
  return folders.filter(
    (f) =>
      (subjectId ? f.subject_id === subjectId : !f.subject_id) &&
      !f.parent_folder_id
  );
}

export function getChildFolders(folders: Folder[], parentId: string): Folder[] {
  return folders.filter((f) => f.parent_folder_id === parentId);
}

/** True if `maybeDescendantId` is the same as `ancestorId` or nested under it. */
export function isFolderDescendant(
  folders: Folder[],
  ancestorId: string,
  maybeDescendantId: string
): boolean {
  if (ancestorId === maybeDescendantId) return true;
  let current = folders.find((f) => f.id === maybeDescendantId);
  const seen = new Set<string>();
  while (current?.parent_folder_id) {
    if (current.parent_folder_id === ancestorId) return true;
    if (seen.has(current.parent_folder_id)) break;
    seen.add(current.parent_folder_id);
    current = folders.find((f) => f.id === current!.parent_folder_id);
  }
  return false;
}

/** Breadcrumb-style label for selects, e.g. "Science / Biology / Cells". */
export function getFolderPathLabel(folders: Folder[], folderId: string): string {
  const parts: string[] = [];
  let current = folders.find((f) => f.id === folderId);
  const seen = new Set<string>();
  while (current) {
    parts.unshift(`${current.icon || "📁"} ${current.name}`);
    if (!current.parent_folder_id || seen.has(current.parent_folder_id)) break;
    seen.add(current.id);
    current = folders.find((f) => f.id === current!.parent_folder_id);
  }
  return parts.join(" / ");
}

/** Folders that can be chosen as a parent for `excludeId` (excludes self + descendants). */
export function getValidParentFolders(folders: Folder[], excludeId?: string | null): Folder[] {
  if (!excludeId) return folders;
  return folders.filter((f) => !isFolderDescendant(folders, excludeId, f.id));
}
