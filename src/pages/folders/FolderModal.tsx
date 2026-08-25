import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import EmojiPicker from "../../components/EmojiPicker";
import { getFolderPathLabel, getValidParentFolders } from "../../utils/folderTree";
import type { Folder, Subject } from "../../services/db";

interface FolderModalProps {
  editingFolder: Folder | null;
  initialParentId?: string;
  initialSubjectId?: string;
  isOpen: boolean;
  folders: Folder[];
  subjects: Subject[];
  onClose: () => void;
  onSave: (name: string, icon: string, subjectId: string | null, parentId: string | null) => Promise<void>;
}

export default function FolderModal({
  editingFolder,
  initialParentId = "none",
  initialSubjectId = "none",
  isOpen,
  folders,
  subjects,
  onClose,
  onSave,
}: FolderModalProps) {
  const [folderName, setFolderName] = useState("");
  const [folderIcon, setFolderIcon] = useState("📁");
  const [folderSubjectId, setFolderSubjectId] = useState<string>("none");
  const [folderParentId, setFolderParentId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingFolder) {
      setFolderName(editingFolder.name);
      setFolderIcon(editingFolder.icon || "📁");
      setFolderSubjectId(editingFolder.subject_id || "none");
      setFolderParentId(editingFolder.parent_folder_id || "none");
    } else {
      setFolderName("");
      setFolderIcon("📁");
      setFolderSubjectId(initialSubjectId);
      setFolderParentId(initialParentId);
    }
  }, [editingFolder, initialParentId, initialSubjectId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim() || saving) return;

    const parentIdVal = folderParentId === "none" || !folderParentId ? null : folderParentId;
    const parentFolder = parentIdVal ? folders.find((f) => f.id === parentIdVal) : null;
    // Nested folders inherit the parent's subject
    const subjectIdVal = parentFolder
      ? parentFolder.subject_id
      : folderSubjectId === "none" || !folderSubjectId
        ? null
        : folderSubjectId;

    try {
      setSaving(true);
      await onSave(folderName, folderIcon, subjectIdVal, parentIdVal);
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
            {editingFolder ? "Edit Folder" : "Create Folder"}
          </span>
          <button className="theme-toggle-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="notion-modal-content">
            <div className="notion-input-group">
              <label>Folder Name</label>
              <input
                className="notion-input"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Science"
                required
                autoFocus
              />
            </div>
            <div className="notion-input-group">
              <label>Parent Folder</label>
              <select
                className="notion-input"
                value={folderParentId}
                onChange={(e) => setFolderParentId(e.target.value)}
              >
                <option value="none">Top level (no parent folder)</option>
                {getValidParentFolders(folders, editingFolder?.id).map((f) => (
                  <option key={f.id} value={f.id}>
                    {getFolderPathLabel(folders, f.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="notion-input-group">
              <label>Subject Assignment</label>
              <select
                className="notion-input"
                value={folderParentId !== "none" ? "inherited" : folderSubjectId}
                onChange={(e) => setFolderSubjectId(e.target.value)}
                disabled={folderParentId !== "none"}
              >
                {folderParentId !== "none" ? (
                  <option value="inherited">Inherited from parent folder</option>
                ) : (
                  <>
                    <option value="none">Unassigned (No Subject)</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <EmojiPicker value={folderIcon} onChange={setFolderIcon} />
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
              {editingFolder ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
