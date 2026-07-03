import React, { useEffect, useState } from "react";
import { 
  getFolders, getDecks, createFolder, createDeck, deleteFolder, deleteDeck, updateFolder, updateDeck,
  getFlashcards, createFlashcard, deleteFlashcard, updateFlashcard,
  Folder, Deck, Flashcard 
} from "../services/db";
import { 
  Plus, Trash2, Edit3, Sparkles, BookOpen, ChevronRight, FileText, X
} from "lucide-react";
import MathText from "../components/MathText";
import EmojiPicker from "../components/EmojiPicker";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";

interface FoldersProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings';
    deckId?: string;
    folderId?: string;
  };
  setCurrentNav: (nav: any) => void;
  onSidebarRefresh: () => void;
}

export default function Folders({ currentNav, setCurrentNav, onSidebarRefresh }: FoldersProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ message: string; variant: StatusVariant } | null>(null);

  const showError = (message: string) => setBanner({ message, variant: "error" });

  // Deck details view
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [deckCards, setDeckCards] = useState<Flashcard[]>([]);

  // Modals / forms state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderIcon, setFolderIcon] = useState("📁");
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  const [showDeckModal, setShowDeckModal] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckIcon, setDeckIcon] = useState("🎴");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckFolderId, setDeckFolderId] = useState<string>("");
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);

  // Flashcard forms state
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [cardTags, setCardTags] = useState("");
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  useEffect(() => {
    loadData();
  }, [currentNav.deckId, currentNav.folderId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const f = await getFolders();
      const d = await getDecks();
      setFolders(f);
      setDecks(d);

      // Handle direct deck display from sidebar click
      if (currentNav.deckId) {
        const deck = d.find(x => x.id === currentNav.deckId);
        if (deck) {
          setSelectedDeck(deck);
          const cards = await getFlashcards(deck.id);
          setDeckCards(cards);
        }
      } else {
        setSelectedDeck(null);
        setDeckCards([]);
      }
    } catch (e) {
      console.error("Failed to load folders page data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    try {
      if (editingFolder) {
        await updateFolder(editingFolder.id, folderName, folderIcon, editingFolder.color);
      } else {
        await createFolder(folderName, folderIcon);
      }
      setFolderName("");
      setFolderIcon("📁");
      setEditingFolder(null);
      setShowFolderModal(false);
      onSidebarRefresh();
      loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to save folder: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;

    try {
      const folderIdVal = deckFolderId === "none" || !deckFolderId ? null : deckFolderId;
      if (editingDeck) {
        await updateDeck(editingDeck.id, deckName, deckIcon, deckDesc, folderIdVal);
      } else {
        await createDeck(deckName, folderIdVal, deckIcon, deckDesc);
      }
      setDeckName("");
      setDeckIcon("🎴");
      setDeckDesc("");
      setDeckFolderId("");
      setEditingDeck(null);
      setShowDeckModal(false);
      onSidebarRefresh();
      loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to save deck: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFront.trim() || !cardBack.trim() || !selectedDeck) return;

    try {
      if (editingCard) {
        await updateFlashcard(editingCard.id, cardFront, cardBack, cardTags);
      } else {
        await createFlashcard(selectedDeck.id, cardFront, cardBack, cardTags);
      }
      setCardFront("");
      setCardBack("");
      setCardTags("");
      setEditingCard(null);
      setShowCardModal(false);
      
      // Reload card list
      const cards = await getFlashcards(selectedDeck.id);
      setDeckCards(cards);
    } catch (e) {
      console.error(e);
      showError("Failed to save flashcard: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleDeleteFolderClick = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this folder? Decks inside will NOT be deleted, they will become Uncategorized.")) return;
    try {
      await deleteFolder(folderId);
      onSidebarRefresh();
      loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to delete folder: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleDeleteDeckClick = async (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this deck and all flashcards inside it?")) return;
    try {
      await deleteDeck(deckId);
      onSidebarRefresh();
      // If we are looking at this deck, close detail view
      if (currentNav.deckId === deckId) {
        setCurrentNav({ page: 'folders' });
      } else {
        loadData();
      }
    } catch (e) {
      console.error(e);
      showError("Failed to delete deck: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleDeleteCardClick = async (cardId: string) => {
    if (!selectedDeck || !confirm("Delete this card?")) return;
    try {
      await deleteFlashcard(cardId);
      const cards = await getFlashcards(selectedDeck.id);
      setDeckCards(cards);
    } catch (e) {
      console.error(e);
      showError("Failed to delete flashcard: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const openEditFolder = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderIcon(folder.icon || "📁");
    setShowFolderModal(true);
  };

  const openEditDeck = (deck: Deck, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDeck(deck);
    setDeckName(deck.name);
    setDeckIcon(deck.icon || "🎴");
    setDeckDesc(deck.description || "");
    setDeckFolderId(deck.folder_id || "none");
    setShowDeckModal(true);
  };

  const openEditCard = (card: Flashcard) => {
    setEditingCard(card);
    setCardFront(card.front);
    setCardBack(card.back);
    setCardTags(card.tags || "");
    setShowCardModal(true);
  };

  if (loading && !selectedDeck) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>Loading folders structure...</div>;
  }

  // RENDER DECK DETAILS
  if (selectedDeck) {
    return (
      <>
        {banner && (
          <StatusBanner
            message={banner.message}
            variant={banner.variant}
            onDismiss={() => setBanner(null)}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9rem", color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => setCurrentNav({ page: 'folders' })}>
          <span>Folders & Decks</span>
          <ChevronRight size={14} />
          <span>{selectedDeck.name}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span className="page-emoji">{selectedDeck.icon || "🎴"}</span>
              <h1 className="page-title" style={{ margin: 0 }}>{selectedDeck.name}</h1>
            </div>
            <p className="sub-description" style={{ marginTop: "8px" }}>
              {selectedDeck.description || "No description provided."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              className="notion-btn"
              onClick={() => setCurrentNav({ page: 'revision', deckId: selectedDeck.id, revisionMode: 'flashcard' })}
              disabled={deckCards.length === 0}
            >
              <BookOpen size={16} />
              Review Cards ({deckCards.length})
            </button>
            <button 
              className="notion-btn secondary"
              onClick={() => setCurrentNav({ page: 'revision', deckId: selectedDeck.id, revisionMode: 'quiz' })}
              disabled={deckCards.length === 0}
            >
              <Sparkles size={16} />
              Take AI Quiz
            </button>
            <button 
              className="notion-btn secondary"
              onClick={() => setCurrentNav({ page: 'revision', deckId: selectedDeck.id, revisionMode: 'teach' })}
              disabled={deckCards.length === 0}
            >
              <Sparkles size={16} />
              Teach AI
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
            <button className="notion-btn secondary" style={{ fontSize: "0.85rem", padding: "6px 12px" }} onClick={() => {
              setEditingCard(null);
              setCardFront("");
              setCardBack("");
              setCardTags("");
              setShowCardModal(true);
            }}>
              <Plus size={14} /> Add Card
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {deckCards.map(card => (
              <div 
                key={card.id} 
                style={{ 
                  border: "1px solid var(--border-color)", 
                  borderRadius: "8px", 
                  padding: "16px",
                  backgroundColor: "var(--bg-secondary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Front:</span>
                      <MathText as="div" style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-primary)", marginTop: "2px" }}>{card.front}</MathText>
                    </div>
                    <div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>Back:</span>
                      <MathText as="div" style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginTop: "2px" }}>{card.back}</MathText>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button 
                      className="theme-toggle-btn"
                      title="Edit Card"
                      onClick={() => openEditCard(card)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      className="theme-toggle-btn"
                      style={{ color: "var(--danger-color)" }}
                      title="Delete Card"
                      onClick={() => handleDeleteCardClick(card.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  <div>
                    {card.tags ? (
                      card.tags.split(',').map((tag, idx) => (
                        <span key={idx} style={{ backgroundColor: "var(--bg-hover)", padding: "2px 6px", borderRadius: "4px", marginRight: "4px", fontSize: "0.7rem", fontWeight: 600 }}>
                          {tag.trim()}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontStyle: "italic" }}>No tags</span>
                    )}
                  </div>
                  <div>
                    Next review: {new Date(card.next_review).toLocaleDateString()} (Interval: {card.interval_days}d)
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
                  fontSize: "0.92rem"
                }}
              >
                No flashcards in this deck yet. Click <strong>Add Card</strong> to create one manually, or use the <strong>AI scanner</strong> to auto-extract definitions!
              </div>
            )}
          </div>
        </div>

        {/* Card Form Modal */}
        {showCardModal && (
          <div className="notion-modal-overlay">
            <div className="notion-modal">
              <div className="notion-modal-header">
                <span className="notion-modal-title">{editingCard ? "Edit Flashcard" : "Add Flashcard"}</span>
                <button className="theme-toggle-btn" onClick={() => setShowCardModal(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleCreateCard}>
                <div className="notion-modal-content">
                  <div className="notion-input-group">
                    <label>Front (Question / Concept)</label>
                    <textarea 
                      className="notion-input" 
                      rows={3} 
                      value={cardFront}
                      onChange={(e) => setCardFront(e.target.value)}
                      placeholder="e.g. Mitochondria"
                      required
                    />
                  </div>
                  <div className="notion-input-group">
                    <label>Back (Answer / Definition)</label>
                    <textarea 
                      className="notion-input" 
                      rows={4} 
                      value={cardBack}
                      onChange={(e) => setCardBack(e.target.value)}
                      placeholder="e.g. Powerhouse of the cell, generates chemical energy in the form of ATP."
                      required
                    />
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
                  <button type="button" className="notion-btn secondary" onClick={() => setShowCardModal(false)}>Cancel</button>
                  <button type="submit" className="notion-btn">Save Card</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  // RENDER DIRECTORY OVERVIEW (FOLDERS & DECKS)
  return (
    <>
      {banner && (
        <StatusBanner
          message={banner.message}
          variant={banner.variant}
          onDismiss={() => setBanner(null)}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="page-emoji">📁</div>
          <h1 className="page-title">Folders & Decks</h1>
          <p className="sub-description">
            Organize your learning workspaces. Group card decks inside dedicated folders.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button className="notion-btn secondary" onClick={() => {
            setEditingFolder(null);
            setFolderName("");
            setFolderIcon("📁");
            setShowFolderModal(true);
          }}>
            <Plus size={16} /> New Folder
          </button>
          <button className="notion-btn" onClick={() => {
            setEditingDeck(null);
            setDeckName("");
            setDeckIcon("🎴");
            setDeckDesc("");
            setDeckFolderId(folders[0]?.id || "none");
            setShowDeckModal(true);
          }}>
            <Plus size={16} /> New Deck
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* Grid structure of folders */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Folders List */}
        {folders.map(folder => {
          const folderDecks = decks.filter(d => d.folder_id === folder.id);
          return (
            <div 
              key={folder.id} 
              style={{ 
                border: "1px solid var(--border-color)", 
                borderRadius: "10px", 
                overflow: "hidden", 
                backgroundColor: "var(--bg-secondary)"
              }}
            >
              <div 
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  padding: "12px 20px", 
                  borderBottom: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-hover)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>{folder.icon || "📁"}</span>
                  <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>{folder.name}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", backgroundColor: "var(--bg-primary)", padding: "2px 8px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    {folderDecks.length} deck{folderDecks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="theme-toggle-btn" onClick={(e) => openEditFolder(folder, e)}>
                    <Edit3 size={14} />
                  </button>
                  <button className="theme-toggle-btn" style={{ color: "var(--danger-color)" }} onClick={(e) => handleDeleteFolderClick(folder.id, e)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div style={{ padding: "20px" }}>
                <div className="decks-grid">
                  {folderDecks.map(deck => (
                    <div 
                      key={deck.id} 
                      className="deck-card"
                      onClick={() => setCurrentNav({ page: 'folders', deckId: deck.id })}
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
                            onClick={(e) => openEditDeck(deck, e)}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button 
                            className="theme-toggle-btn" 
                            style={{ color: "var(--danger-color)", padding: "2px" }}
                            onClick={(e) => handleDeleteDeckClick(deck.id, e)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {folderDecks.length === 0 && (
                    <div style={{ gridColumn: "1/-1", padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", fontStyle: "italic" }}>
                      Folder is empty. Create a new deck and put it in this folder!
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Uncategorized Decks */}
        {decks.filter(d => !d.folder_id).length > 0 && (
          <div 
            style={{ 
              border: "1px solid var(--border-color)", 
              borderRadius: "10px", 
              overflow: "hidden", 
              backgroundColor: "var(--bg-secondary)"
            }}
          >
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                padding: "12px 20px", 
                borderBottom: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-hover)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.5rem" }}>🗃️</span>
                <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Uncategorized Decks</span>
              </div>
            </div>

            <div style={{ padding: "20px" }}>
              <div className="decks-grid">
                {decks.filter(d => !d.folder_id).map(deck => (
                  <div 
                    key={deck.id} 
                    className="deck-card"
                    onClick={() => setCurrentNav({ page: 'folders', deckId: deck.id })}
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
                          onClick={(e) => openEditDeck(deck, e)}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          className="theme-toggle-btn" 
                          style={{ color: "var(--danger-color)", padding: "2px" }}
                          onClick={(e) => handleDeleteDeckClick(deck.id, e)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {folders.length === 0 && decks.length === 0 && (
          <div 
            style={{ 
              border: "1px dashed var(--border-color)", 
              borderRadius: "8px", 
              padding: "48px", 
              textAlign: "center", 
              color: "var(--text-muted)",
              fontSize: "0.95rem"
            }}
          >
            No folders or decks found. Click <strong>New Folder</strong> or <strong>New Deck</strong> to start mapping your revision sets!
          </div>
        )}
      </div>

      {/* Folder Creation Modal */}
      {showFolderModal && (
        <div className="notion-modal-overlay">
          <div className="notion-modal">
            <div className="notion-modal-header">
              <span className="notion-modal-title">{editingFolder ? "Edit Folder" : "Create Folder"}</span>
              <button className="theme-toggle-btn" onClick={() => setShowFolderModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
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
                <EmojiPicker value={folderIcon} onChange={setFolderIcon} />
              </div>
              <div className="notion-modal-footer">
                <button type="button" className="notion-btn secondary" onClick={() => setShowFolderModal(false)}>Cancel</button>
                <button type="submit" className="notion-btn">{editingFolder ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deck Creation Modal */}
      {showDeckModal && (
        <div className="notion-modal-overlay">
          <div className="notion-modal">
            <div className="notion-modal-header">
              <span className="notion-modal-title">{editingDeck ? "Edit Deck" : "Create Deck"}</span>
              <button className="theme-toggle-btn" onClick={() => setShowDeckModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateDeck}>
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
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.icon} {f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="notion-modal-footer">
                <button type="button" className="notion-btn secondary" onClick={() => setShowDeckModal(false)}>Cancel</button>
                <button type="submit" className="notion-btn">{editingDeck ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
