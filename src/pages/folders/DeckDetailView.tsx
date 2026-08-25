import {
  ChevronRight,
  BookOpen,
  Sparkles,
  QrCode,
  Download,
  Plus,
  Edit3,
  Trash2,
  FileText,
} from "lucide-react";
import MathText from "../../components/MathText";
import { stateLabel } from "../../services/fsrs";
import { setDragData } from "../../utils/dnd";
import type { Deck, Flashcard } from "../../services/db";

interface DeckDetailViewProps {
  selectedDeck: Deck;
  deckCards: Flashcard[];
  onNavigateBack: () => void;
  onNavigateRevision: (mode: "flashcard" | "quiz" | "teach") => void;
  onQrShare: () => void;
  onExport: () => void;
  onAddCard: () => void;
  onEditCard: (card: Flashcard) => void;
  onDeleteCard: (cardId: string) => void;
}

export default function DeckDetailView({
  selectedDeck,
  deckCards,
  onNavigateBack,
  onNavigateRevision,
  onQrShare,
  onExport,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: DeckDetailViewProps) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.9rem",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
        onClick={onNavigateBack}
      >
        <span>Folders & Decks</span>
        <ChevronRight size={14} />
        <span>{selectedDeck.name}</span>
      </div>

      <div className="page-header-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className="page-emoji">{selectedDeck.icon || "🎴"}</span>
            <h1 className="page-title" style={{ margin: 0 }}>
              {selectedDeck.name}
            </h1>
          </div>
          <p className="sub-description" style={{ marginTop: "8px" }}>
            {selectedDeck.description || "No description provided."}
          </p>
        </div>

        <div className="page-header-actions">
          <button
            className="notion-btn"
            onClick={() => onNavigateRevision("flashcard")}
            disabled={deckCards.length === 0}
          >
            <BookOpen size={16} />
            Review Cards ({deckCards.length})
          </button>
          <button
            className="notion-btn secondary"
            onClick={() => onNavigateRevision("quiz")}
            disabled={deckCards.length === 0}
          >
            <Sparkles size={16} />
            Take AI Quiz
          </button>
          <button
            className="notion-btn secondary"
            onClick={() => onNavigateRevision("teach")}
            disabled={deckCards.length === 0}
          >
            <Sparkles size={16} />
            Teach AI
          </button>
          <button
            className="notion-btn secondary"
            title="Share via Encrypted QR Code"
            onClick={onQrShare}
          >
            <QrCode size={16} />
            Share QR
          </button>
          <button
            className="notion-btn secondary"
            title="Export Deck (.oxdeck)"
            onClick={onExport}
          >
            <Download size={16} />
            Export (.oxdeck)
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* Flashcards List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="section-title" style={{ fontSize: "1.2rem" }}>
            <FileText size={18} /> Flashcards in Deck
          </h2>
          <button
            className="notion-btn secondary"
            style={{ fontSize: "0.85rem", padding: "6px 12px" }}
            onClick={onAddCard}
          >
            <Plus size={14} /> Add Card
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {deckCards.map((card) => (
            <div
              key={card.id}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "16px",
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                cursor: "grab",
              }}
              draggable
              onDragStart={(e) => setDragData(e, "flashcard", card.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Front:</span>
                    {(card.front_image_url || card.image_url) && (
                      <div style={{ marginTop: "4px" }}>
                        <img
                          src={card.front_image_url || card.image_url!}
                          alt="Front Image"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "140px",
                            objectFit: "contain",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "#fff",
                          }}
                        />
                      </div>
                    )}
                    {card.front && card.front !== "(Image)" && (
                      <MathText as="div" style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)", marginTop: "2px" }}>
                        {card.front}
                      </MathText>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Back:</span>
                    {card.back_image_url && (
                      <div style={{ marginTop: "4px" }}>
                        <img
                          src={card.back_image_url}
                          alt="Back Image"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "140px",
                            objectFit: "contain",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "#fff",
                          }}
                        />
                      </div>
                    )}
                    {card.back && card.back !== "(Image)" && (
                      <MathText as="div" style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {card.back}
                      </MathText>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="theme-toggle-btn"
                    title="Edit Card"
                    onClick={() => onEditCard(card)}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    className="theme-toggle-btn"
                    style={{ color: "var(--danger-color)" }}
                    title="Delete Card"
                    onClick={() => onDeleteCard(card.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: "8px",
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                }}
              >
                <div>
                  {card.tags ? (
                    card.tags.split(",").map((tag, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: "var(--bg-hover)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          marginRight: "4px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                        }}
                      >
                        {tag.trim()}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontStyle: "italic" }}>No tags</span>
                  )}
                </div>
                <div>
                  Next: {new Date(card.next_review).toLocaleDateString()} ({stateLabel(card.state)}, {card.scheduled_days}d)
                </div>
              </div>
            </div>
          ))}

          {deckCards.length === 0 && (
            <div
              style={{
                border: "1px dashed var(--border-color)",
                borderRadius: "8px",
                padding: "40px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              No flashcards in this deck yet. Click <strong>Add Card</strong> above or go to <strong>Create Flashcards</strong> tab!
            </div>
          )}
        </div>
      </div>
    </>
  );
}
