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

let autoScrollAnimationFrameId: number | null = null;
let currentScrollSpeed = 0;
let activeScrollTarget: HTMLElement | null = null;

function stepAutoScroll() {
  if (activeScrollTarget && currentScrollSpeed !== 0) {
    activeScrollTarget.scrollTop += currentScrollSpeed;
    autoScrollAnimationFrameId = requestAnimationFrame(stepAutoScroll);
  } else {
    autoScrollAnimationFrameId = null;
  }
}

export function handleDragAutoScroll(e: DragEvent | globalThis.DragEvent): void {
  const clientY = e.clientY;
  if (clientY === undefined || clientY === 0) return;

  // Find scrollable container under cursor or default to .workspace-content
  let target = (e.target as HTMLElement)?.closest?.(".workspace-content, .sidebar-content") as HTMLElement | null;
  if (!target) {
    target = document.querySelector(".workspace-content") as HTMLElement | null;
  }
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const EDGE_THRESHOLD = 160; // 160px edge trigger zone

  let speed = 0;

  // Check top proximity
  if (clientY < rect.top + EDGE_THRESHOLD) {
    const dist = Math.max(0, rect.top + EDGE_THRESHOLD - clientY);
    speed = -Math.min(35, Math.max(5, dist * 0.35));
  } 
  // Check bottom proximity
  else if (clientY > rect.bottom - EDGE_THRESHOLD) {
    const dist = Math.max(0, clientY - (rect.bottom - EDGE_THRESHOLD));
    speed = Math.min(35, Math.max(5, dist * 0.35));
  }

  currentScrollSpeed = speed;
  activeScrollTarget = target;

  if (speed !== 0 && !autoScrollAnimationFrameId) {
    autoScrollAnimationFrameId = requestAnimationFrame(stepAutoScroll);
  } else if (speed === 0 && autoScrollAnimationFrameId) {
    cancelAnimationFrame(autoScrollAnimationFrameId);
    autoScrollAnimationFrameId = null;
  }
}

export function stopDragAutoScroll(): void {
  currentScrollSpeed = 0;
  activeScrollTarget = null;
  if (autoScrollAnimationFrameId) {
    cancelAnimationFrame(autoScrollAnimationFrameId);
    autoScrollAnimationFrameId = null;
  }
}

export function handleDragWheel(e: WheelEvent): void {
  const x = e.clientX;
  const y = e.clientY;

  let target: HTMLElement | null = null;
  if (x !== undefined && y !== undefined) {
    const el = document.elementFromPoint(x, y);
    target = el?.closest?.(".workspace-content, .sidebar-content") as HTMLElement | null;
  }
  if (!target && e.target) {
    target = (e.target as HTMLElement)?.closest?.(".workspace-content, .sidebar-content") as HTMLElement | null;
  }
  if (!target) {
    target = document.querySelector(".workspace-content") as HTMLElement | null;
  }

  if (target) {
    target.scrollTop += e.deltaY;
  }
}

/** Allow drop on a target; set dropEffect so the cursor shows a move affordance. */
export function allowDrop(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  handleDragAutoScroll(e);
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
  stopDragAutoScroll();
  const payload = getDragData(e);
  if (!payload || payload.type !== expectedType) return null;

  e.preventDefault();
  e.stopPropagation();
  return payload;
}
