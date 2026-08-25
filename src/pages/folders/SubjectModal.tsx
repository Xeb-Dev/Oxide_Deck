import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import EmojiPicker from "../../components/EmojiPicker";
import type { Subject } from "../../services/db";

interface SubjectModalProps {
  editingSubject: Subject | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, icon: string) => Promise<void>;
}

export default function SubjectModal({
  editingSubject,
  isOpen,
  onClose,
  onSave,
}: SubjectModalProps) {
  const [subjectName, setSubjectName] = useState("");
  const [subjectIcon, setSubjectIcon] = useState("📚");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingSubject) {
      setSubjectName(editingSubject.name);
      setSubjectIcon(editingSubject.icon || "📚");
    } else {
      setSubjectName("");
      setSubjectIcon("📚");
    }
  }, [editingSubject, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim() || saving) return;
    try {
      setSaving(true);
      await onSave(subjectName, subjectIcon);
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
            {editingSubject ? "Edit Subject" : "Create Subject"}
          </span>
          <button className="theme-toggle-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="notion-modal-content">
            <div className="notion-input-group">
              <label>Subject Name</label>
              <input
                className="notion-input"
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Mathematics"
                required
                autoFocus
              />
            </div>
            <EmojiPicker value={subjectIcon} onChange={setSubjectIcon} />
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
              {editingSubject ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
