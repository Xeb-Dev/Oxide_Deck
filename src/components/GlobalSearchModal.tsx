import { useEffect, useRef, useState } from "react";
import { Search, X, Folder, BookOpen, FileText, ChevronRight, AlertCircle } from "lucide-react";
import { searchGlobal, GlobalSearchResult } from "../services/db";
import MathText from "./MathText";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nav: any) => void;
}

export default function GlobalSearchModal({ isOpen, onClose, onNavigate }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchGlobal(query)
        .then((res) => setResults(res))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const totalResults = results
    ? results.flashcards.length + results.foldersAndDecks.length + results.tests.length
    : 0;

  const handleSelectDeck = (deckId: string) => {
    onNavigate({ page: 'folders', deckId });
    onClose();
  };

  const handleSelectFolder = (folderId: string) => {
    onNavigate({ page: 'folders', folderId });
    onClose();
  };

  const handleSelectTest = () => {
    onNavigate({ page: 'tests' });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 3rem)",
        paddingLeft: "1rem",
        paddingRight: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--bg-primary, #ffffff)",
          color: "var(--text-primary, #1f2937)",
          width: "100%",
          maxWidth: "640px",
          borderRadius: "12px",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.25), 0 10px 15px -5px rgba(0, 0, 0, 0.1)",
          border: "1px solid var(--border-color, #e5e7eb)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
          overflow: "hidden",
          animation: "modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 18px",
            borderBottom: "1px solid var(--border-color, #e5e7eb)",
            backgroundColor: "var(--bg-secondary, #f9fafb)",
          }}
        >
          <Search size={20} style={{ color: "var(--accent-color, #6366f1)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            className="notion-input"
            style={{
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
              fontSize: "1.05rem",
              fontWeight: 500,
              width: "100%",
              boxShadow: "none"
            }}
            placeholder="Search flashcards, folders, decks, tests..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center"
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Results Container */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {loading && (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              Searching...
            </div>
          )}

          {!loading && !query.trim() && (
            <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
              Type keyword to find flashcards, folders, decks, or tests.
            </div>
          )}

          {!loading && query.trim() && totalResults === 0 && (
            <div style={{ padding: "35px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
              <AlertCircle size={24} style={{ marginBottom: "8px", opacity: 0.6 }} />
              <div>No results found for "<strong>{query}</strong>"</div>
            </div>
          )}

          {!loading && results && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Folders & Decks Section */}
              {results.foldersAndDecks.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Folder size={14} /> Folders & Decks ({results.foldersAndDecks.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {results.foldersAndDecks.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => {
                          if (item.type === 'deck') handleSelectDeck(item.id);
                          else if (item.type === 'folder') handleSelectFolder(item.id);
                          else onNavigate({ page: 'folders' });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          backgroundColor: "var(--bg-secondary, #f9fafb)",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                              {item.type}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flashcards Section */}
              {results.flashcards.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <BookOpen size={14} /> Flashcards ({results.flashcards.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {results.flashcards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => handleSelectDeck(card.deck_id)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          backgroundColor: "var(--bg-secondary, #f9fafb)",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-color, #6366f1)" }}>
                            🎴 {card.deck_name}
                          </span>
                          {card.tags && (
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              #{card.tags}
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                          <MathText>{card.front}</MathText>
                        </div>
                        {card.back && (
                          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <MathText>{card.back}</MathText>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tests Section */}
              {results.tests.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <FileText size={14} /> Tests & Exams ({results.tests.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {results.tests.map((test) => (
                      <div
                        key={test.id}
                        onClick={handleSelectTest}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          backgroundColor: "var(--bg-secondary, #f9fafb)",
                          border: "1px solid var(--border-color, #e5e7eb)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>📝 {test.name}</div>
                          {test.description && (
                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                              {test.description}
                            </div>
                          )}
                        </div>
                        <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
