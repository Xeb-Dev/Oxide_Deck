import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import EmojiPicker from "../../components/EmojiPicker";
import { getFolderPathLabel } from "../../utils/folderTree";
import type { Deck, Folder } from "../../services/db";

interface DeckModalProps {
  editingDeck: Deck | null;
  isOpen: boolean;
  folders: Folder[];
  onClose: () => void;
  onSave: (name: string, icon: string, description: string, folderId: string | null) => Promise<void>;
}

export default function DeckModal({
  editingDeck,
  isOpen,
  folders,
  onClose,
  onSave,
}: DeckModalProps) {
  const [deckName, setDeckName] = useState("");
  const [deckIcon, setDeckIcon] = useState("🎴");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckFolderId, setDeckFolderId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingDeck) {
      setDeckName(editingDeck.name);
      setDeckIcon(editingDeck.icon || "🎴");
      setDeckDesc(editingDeck.description || "");
      setDeckFolderId(editingDeck.folder_id || "none");
    } else {
      setDeckName("");
      setDeckIcon("🎴");
      setDeckDesc("");
      setDeckFolderId(folders[0]?.id || "none");
    }
  }, [editingDeck, folders, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim() || saving) return;

    const folderIdVal = deckFolderId === "none" || !deckFolderId ? null : deckFolderId;
    try {
      setSaving(true);
      await onSave(deckName, deckIcon, deckDesc, folderIdVal);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notion-modal-overlay">
      <div className="notion-modal">
        <div className="notion-modal-header">
          <span className="notion-modal-title">
            {editingDeck ? "Edit Deck" : "Create Deck"}
          </span>
          <button className="theme-toggle-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="notion-modal-content">
            <div className="notion-input-group">
              <label>Deck Name</label>
              <input
                className="notion-input"
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="e.g. Biology Organelles"
                required
                autoFocus
              />
            </div>
            <EmojiPicker value={deckIcon} onChange={setDeckIcon} />
            <div className="notion-input-group">
              <label>Description</label>
              <textarea
                className="notion-input"
                value={deckDesc}
                onChange={(e) => setDeckDesc(e.target.value)}
                placeholder="Brief description of what cards in this deck are about..."
                rows={2}
              />
            </div>
            <div className="notion-input-group">
              <label>Folder Assignment</label>
              <select
                className="notion-input"
                value={deckFolderId}
                onChange={(e) => setDeckFolderId(e.target.value)}
              >
                <option value="none">Uncategorized (No Folder)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {getFolderPathLabel(folders, f.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="notion-modal-footer">
            <button
              type="button"
              className="notion-btn secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="notion-btn" disabled={saving}>
              {editingDeck ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
