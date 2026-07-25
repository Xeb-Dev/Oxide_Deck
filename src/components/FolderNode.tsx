import React from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import {
  Deck,
  Folder,
  moveFlashcardToDeck,
  moveFolderToParent,
  updateDeckFolder,
} from "../services/db";
import { acceptDrop, allowDrop, getDragData, setDragData } from "../utils/dnd";
import { getChildFolders, isFolderDescendant } from "../utils/folderTree";

interface FolderNodeProps {
  folder: Folder;
  folders: Folder[];
  decks: Deck[];
  dragOverId: string | null;
  onDragEnter: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (id: string) => (e: React.DragEvent<HTMLElement>) => void;
  onClearDragOver: () => void;
  onRefresh: () => void;
  onEditFolder: (folder: Folder, e: React.MouseEvent) => void;
  onDeleteFolder: (folderId: string, e: React.MouseEvent) => void;
  onAddSubfolder: (parent: Folder, e: React.MouseEvent) => void;
  onEditDeck: (deck: Deck, e: React.MouseEvent) => void;
  onDeleteDeck: (deckId: string, e: React.MouseEvent) => void;
  onOpenDeck: (deckId: string) => void;
}

export default function FolderNode({
  folder,
  folders,
  decks,
  dragOverId,
  onDragEnter,
  onDragLeave,
  onClearDragOver,
  onRefresh,
  onEditFolder,
  onDeleteFolder,
  onAddSubfolder,
  onEditDeck,
  onDeleteDeck,
  onOpenDeck,
}: FolderNodeProps) {
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
      style={{
        border: isFolderDragOver ? "2px dashed var(--accent-color)" : "1px solid var(--border-color)",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: isFolderDragOver ? "var(--accent-light)" : "var(--bg-primary)",
        cursor: "grab",
        transition: "all var(--transition-fast)",
      }}
      draggable
      onDragStart={(e) => setDragData(e, "folder", folder.id)}
      onDragOver={allowDrop}
      onDragEnter={onDragEnter(folder.id)}
      onDragLeave={onDragLeave(folder.id)}
      onDrop={handleDrop}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-hover)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.5rem" }}>{folder.icon || "📁"}</span>
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{folder.name}</span>
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-secondary)",
              padding: "2px 8px",
              borderRadius: "10px",
              border: "1px solid var(--border-color)",
            }}
          >
            {childFolders.length} folder{childFolders.length !== 1 ? "s" : ""} · {folderDecks.length} deck
            {folderDecks.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button
            className="theme-toggle-btn"
            title="Add subfolder"
            onClick={(e) => onAddSubfolder(folder, e)}
          >
            <Plus size={14} />
          </button>
          <button className="theme-toggle-btn" onClick={(e) => onEditFolder(folder, e)}>
            <Edit3 size={14} />
          </button>
          <button
            className="theme-toggle-btn"
            style={{ color: "var(--danger-color)" }}
            onClick={(e) => onDeleteFolder(folder.id, e)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {childFolders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingLeft: "12px", borderLeft: "2px solid var(--border-color)" }}>
            {childFolders.map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                folders={folders}
                decks={decks}
                dragOverId={dragOverId}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onClearDragOver={onClearDragOver}
                onRefresh={onRefresh}
                onEditFolder={onEditFolder}
                onDeleteFolder={onDeleteFolder}
                onAddSubfolder={onAddSubfolder}
                onEditDeck={onEditDeck}
                onDeleteDeck={onDeleteDeck}
                onOpenDeck={onOpenDeck}
              />
            ))}
          </div>
        )}

        <div className="decks-grid">
          {folderDecks.map((deck) => {
            const isDeckDragOver = dragOverId === deck.id;
            return (
              <div
                key={deck.id}
                className="deck-card"
                onClick={() => onOpenDeck(deck.id)}
                style={{
                  border: isDeckDragOver ? "2px dashed var(--accent-color)" : undefined,
                  backgroundColor: isDeckDragOver ? "var(--accent-light)" : undefined,
                  cursor: "grab",
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
                  onRefresh();
                  window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                }}
              >
                <div className="deck-card-header">
                  <span className="deck-card-emoji">{deck.icon || "🎴"}</span>
                  <span className="deck-card-title">{deck.name}</span>
                </div>
                <p className="deck-card-desc">{deck.description || "No description."}</p>
                <div className="deck-card-meta">
                  <span>Click to open</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button
                      className="theme-toggle-btn"
                      style={{ padding: "2px" }}
                      onClick={(e) => onEditDeck(deck, e)}
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      className="theme-toggle-btn"
                      style={{ color: "var(--danger-color)", padding: "2px" }}
                      onClick={(e) => onDeleteDeck(deck.id, e)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {folderDecks.length === 0 && childFolders.length === 0 && (
            <div
              style={{
                gridColumn: "1/-1",
                padding: "16px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.88rem",
                fontStyle: "italic",
              }}
            >
              Empty folder — add a subfolder or deck, or drop one here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
