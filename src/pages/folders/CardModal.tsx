import React, { useState, useEffect } from "react";
import { X, ImagePlus } from "lucide-react";
import { convertToWebP } from "../../utils/image";
import type { StatusVariant } from "../../components/StatusBanner";
import type { Flashcard } from "../../services/db";

interface CardModalProps {
  editingCard: Flashcard | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    front: string,
    back: string,
    tags: string,
    frontImg: string | null,
    backImg: string | null
  ) => Promise<void>;
  onShowBanner: (message: string, variant: StatusVariant) => void;
}

export default function CardModal({
  editingCard,
  isOpen,
  onClose,
  onSave,
  onShowBanner,
}: CardModalProps) {
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [cardTags, setCardTags] = useState("");
  const [cardFrontImageUrl, setCardFrontImageUrl] = useState<string | null>(null);
  const [cardBackImageUrl, setCardBackImageUrl] = useState<string | null>(null);
  const [isDraggingOverFrontModal, setIsDraggingOverFrontModal] = useState(false);
  const [isDraggingOverBackModal, setIsDraggingOverBackModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingCard) {
      setCardFront(editingCard.front === "(Image)" ? "" : editingCard.front);
      setCardBack(editingCard.back === "(Image)" ? "" : editingCard.back);
      setCardTags(editingCard.tags || "");
      setCardFrontImageUrl(editingCard.front_image_url || editingCard.image_url || null);
      setCardBackImageUrl(editingCard.back_image_url || null);
    } else {
      setCardFront("");
      setCardBack("");
      setCardTags("");
      setCardFrontImageUrl(null);
      setCardBackImageUrl(null);
    }
  }, [editingCard, isOpen]);

  if (!isOpen) return null;

  const processCardModalImage = async (file: File, side: "front" | "back") => {
    try {
      onShowBanner(`Converting image to WebP format for ${side.toUpperCase()}...`, "info");
      const webpUrl = await convertToWebP(file);
      if (side === "front") {
        setCardFrontImageUrl(webpUrl);
      } else {
        setCardBackImageUrl(webpUrl);
      }
      onShowBanner(`Image attached to ${side.toUpperCase()} (WebP format)!`, "success");
    } catch (err: any) {
      console.error(err);
      onShowBanner("Failed to process image into WebP format.", "error");
    }
  };

  const handleCardModalDrop = async (e: React.DragEvent, side: "front" | "back") => {
    e.preventDefault();
    if (side === "front") setIsDraggingOverFrontModal(false);
    else setIsDraggingOverBackModal(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find((f) => f.type.startsWith("image/"));
    if (imageFile) {
      await processCardModalImage(imageFile, side);
    }
  };

  const handleCardModalPaste = async (e: React.ClipboardEvent, side: "front" | "back") => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        await processCardModalImage(file, side);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!cardFront.trim() && !cardFrontImageUrl) || (!cardBack.trim() && !cardBackImageUrl) || saving) {
      return;
    }

    try {
      setSaving(true);
      await onSave(
        cardFront || "(Image)",
        cardBack || "(Image)",
        cardTags,
        cardFrontImageUrl,
        cardBackImageUrl
      );
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
            {editingCard ? "Edit Flashcard" : "Add Flashcard"}
          </span>
          <button className="theme-toggle-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="notion-modal-content">
            <div className="notion-input-group">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Front (Question / Concept)</span>
                <span className="desktop-drop-hint" style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "normal" }}>
                  📷 Drop / Paste Image for Front
                </span>
                <label className="phone-add-picture-btn">
                  <ImagePlus size={13} /> Add Picture
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processCardModalImage(f, "front");
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </label>
              <textarea
                className="notion-input"
                rows={3}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOverFrontModal(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingOverFrontModal(false);
                }}
                onDrop={(e) => handleCardModalDrop(e, "front")}
                onPaste={(e) => handleCardModalPaste(e, "front")}
                placeholder="Front question/term... (or drop image here for Front)"
                style={{
                  border: isDraggingOverFrontModal ? "2px dashed var(--accent-color)" : undefined,
                  backgroundColor: isDraggingOverFrontModal ? "rgba(99, 102, 241, 0.08)" : undefined,
                }}
              />
              {cardFrontImageUrl && (
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", border: "1px solid var(--accent-color)", borderRadius: "6px", backgroundColor: "var(--bg-secondary)" }}>
                  <img src={cardFrontImageUrl} alt="Front WebP" style={{ maxWidth: "60px", maxHeight: "45px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }} />
                  <span style={{ flex: 1, fontSize: "0.76rem", fontWeight: 600, color: "var(--accent-color)" }}>📷 Front Image Attached</span>
                  <button type="button" className="notion-btn secondary" style={{ padding: "2px 6px", fontSize: "0.7rem", color: "#e11d48" }} onClick={() => setCardFrontImageUrl(null)}>Remove</button>
                </div>
              )}
            </div>

            <div className="notion-input-group">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Back (Answer / Definition)</span>
                <span className="desktop-drop-hint" style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "normal" }}>
                  📷 Drop / Paste Image for Back
                </span>
                <label className="phone-add-picture-btn">
                  <ImagePlus size={13} /> Add Picture
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) processCardModalImage(f, "back");
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              </label>
              <textarea
                className="notion-input"
                rows={4}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOverBackModal(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingOverBackModal(false);
                }}
                onDrop={(e) => handleCardModalDrop(e, "back")}
                onPaste={(e) => handleCardModalPaste(e, "back")}
                placeholder="Back answer/definition... (or drop image here for Back)"
                style={{
                  border: isDraggingOverBackModal ? "2px dashed var(--accent-color)" : undefined,
                  backgroundColor: isDraggingOverBackModal ? "rgba(99, 102, 241, 0.08)" : undefined,
                }}
              />
              {cardBackImageUrl && (
                <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", border: "1px solid var(--accent-color)", borderRadius: "6px", backgroundColor: "var(--bg-secondary)" }}>
                  <img src={cardBackImageUrl} alt="Back WebP" style={{ maxWidth: "60px", maxHeight: "45px", objectFit: "contain", borderRadius: "4px", border: "1px solid var(--border-color)", backgroundColor: "#fff" }} />
                  <span style={{ flex: 1, fontSize: "0.76rem", fontWeight: 600, color: "var(--accent-color)" }}>📷 Back Image Attached</span>
                  <button type="button" className="notion-btn secondary" style={{ padding: "2px 6px", fontSize: "0.7rem", color: "#e11d48" }} onClick={() => setCardBackImageUrl(null)}>Remove</button>
                </div>
              )}
            </div>

            <div className="notion-input-group">
              <label>Tags (Comma separated)</label>
              <input
                className="notion-input"
                type="text"
                value={cardTags}
                onChange={(e) => setCardTags(e.target.value)}
                placeholder="biology, cells, organelles"
              />
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
              {editingCard ? "Save Changes" : "Save Card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
