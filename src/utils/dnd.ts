import type { DragEvent } from "react";

export type DragItemType = "folder" | "deck" | "flashcard";

export interface DragPayload {
  type: DragItemType;
  id: string;
}

const MIME = "application/x-oxide-deck";

/** Start a drag; stops bubbling so nested draggables don't overwrite each other. */
export function setDragData(e: DragEvent, type: DragItemType, id: string): void {
  e.stopPropagation();
  e.dataTransfer.effectAllowed = "move";
  const payload = JSON.stringify({ type, id } satisfies DragPayload);
  // text/plain is required for reliable HTML5 DnD in WebView2
  e.dataTransfer.setData("text/plain", payload);
  try {
    e.dataTransfer.setData(MIME, payload);
  } catch {
    // Some webviews reject custom MIME types
  }
}

export function getDragData(e: DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData("application/x-oxide-deck") || e.dataTransfer.getData("text/plain");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed?.type && parsed?.id) return parsed;
  } catch {
    // ignore malformed payloads
  }

  return null;
}

/** Allow drop on a target; set dropEffect so the cursor shows a move affordance. */
export function allowDrop(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

/**
 * Handle a drop only if the payload type matches.
 * Returns true when handled (caller should refresh UI).
 * Unmatched drops are left to bubble to a parent zone.
 */
export function acceptDrop(
  e: DragEvent,
  expectedType: DragItemType
): DragPayload | null {
  const payload = getDragData(e);
  if (!payload || payload.type !== expectedType) return null;

  e.preventDefault();
  e.stopPropagation();
  return payload;
}
