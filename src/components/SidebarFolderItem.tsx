import React from "react";
import { ChevronRight } from "lucide-react";
import {
  Deck,
  Folder,
  moveFlashcardToDeck,
  moveFolderToParent,
  updateDeckFolder,
} from "../services/db";
import { acceptDrop, allowDrop, getDragData, setDragData } from "../utils/dnd";
import { getChildFolders, isFolderDescendant } from "../utils/folderTree";

interface SidebarFolderItemProps {
  folder: Folder;
  folders: Folder[];
  decks: Deck[];
  depth?: number;
  expandedFolders: Record<string, boolean>;
  dragOverId: string | null;
  activeDeckId?: string;
  onToggleFolder: (folderId: string, e: React.MouseEvent) => void;
  onDragEnter: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onClearDragOver: () => void;
  onRefresh: () => void;
  onNavigateFolder: (folderId: string) => void;
  onNavigateDeck: (deckId: string) => void;
}

export default function SidebarFolderItem({
  folder,
  folders,
  decks,
  depth = 0,
  expandedFolders,
  dragOverId,
  activeDeckId,
  onToggleFolder,
  onDragEnter,
  onDragLeave,
  onClearDragOver,
  onRefresh,
  onNavigateFolder,
  onNavigateDeck,
}: SidebarFolderItemProps) {
  const isOpen = !!expandedFolders[folder.id];
  const folderDecks = decks.filter((d) => d.folder_id === folder.id);
  const childFolders = getChildFolders(folders, folder.id);
  const isFolderDragOver = dragOverId === folder.id;

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    onClearDragOver();
    const raw = getDragData(e);

    if (raw?.type === "folder") {
      e.preventDefault();
      e.stopPropagation();
      if (isFolderDescendant(folders, raw.id, folder.id)) return;
      await moveFolderToParent(raw.id, folder.id, folder.subject_id);
      onRefresh();
      window.dispatchEvent(new Event("oxide-deck-db-refresh"));
      return;
    }

    const deckPayload = acceptDrop(e, "deck");
    if (deckPayload) {
      await updateDeckFolder(deckPayload.id, folder.id);
      onRefresh();
      window.dispatchEvent(new Event("oxide-deck-db-refresh"));
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", paddingLeft: depth > 0 ? "12px" : undefined }}
      draggable
      onDragStart={(e) => setDragData(e, "folder", folder.id)}
      onDragOver={allowDrop}
      onDragEnter={onDragEnter(folder.id)}
      onDragLeave={onDragLeave(folder.id)}
      onDrop={handleDrop}
    >
      <div
        className="sidebar-item"
        style={{
          justifyContent: "space-between",
          border: isFolderDragOver ? "2px dashed var(--accent-color)" : "none",
          backgroundColor: isFolderDragOver ? "var(--accent-light)" : undefined,
          borderRadius: "6px",
        }}
        onClick={() => onNavigateFolder(folder.id)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>{folder.icon || "📁"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
            {folder.name}
          </span>
        </div>
        <button
          className="sidebar-item-arrow-btn"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}
          onClick={(e) => onToggleFolder(folder.id, e)}
        >
          <ChevronRight size={12} className={`sidebar-item-arrow ${isOpen ? "open" : ""}`} />
        </button>
      </div>

      {isOpen && (
        <div className="sidebar-sub-list" style={{ paddingLeft: "12px" }}>
          {childFolders.map((child) => (
            <SidebarFolderItem
              key={child.id}
              folder={child}
              folders={folders}
              decks={decks}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              dragOverId={dragOverId}
              activeDeckId={activeDeckId}
              onToggleFolder={onToggleFolder}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onClearDragOver={onClearDragOver}
              onRefresh={onRefresh}
              onNavigateFolder={onNavigateFolder}
              onNavigateDeck={onNavigateDeck}
            />
          ))}

          {folderDecks.map((deck) => {
            const isDeckDragOver = dragOverId === deck.id;
            return (
              <div
                key={deck.id}
                className={`sidebar-item ${activeDeckId === deck.id ? "active" : ""}`}
                onClick={() => onNavigateDeck(deck.id)}
                style={{
                  fontSize: "0.8rem",
                  padding: "3px 6px",
                  border: isDeckDragOver ? "2px dashed var(--accent-color)" : "none",
                  backgroundColor: isDeckDragOver ? "var(--accent-light)" : undefined,
                  borderRadius: "4px",
                }}
                draggable
                onDragStart={(e) => setDragData(e, "deck", deck.id)}
                onDragOver={allowDrop}
                onDragEnter={onDragEnter(deck.id)}
                onDragLeave={onDragLeave(deck.id)}
                onDrop={async (e) => {
                  onClearDragOver();
                  const payload = acceptDrop(e, "flashcard");
                  if (!payload) return;
                  await moveFlashcardToDeck(payload.id, deck.id);
                  window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                }}
              >
                <span>{deck.icon || "🎴"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deck.name}
                </span>
              </div>
            );
          })}

          {childFolders.length === 0 && folderDecks.length === 0 && (
            <div style={{ padding: "3px 6px", fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}
