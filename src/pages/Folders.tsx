import React, { useEffect, useState } from "react";
import {
  getFolders, getDecks, createFolder, createDeck, deleteFolder, deleteDeck, updateFolder, updateDeck,
  getFlashcards, createFlashcard, deleteFlashcard, updateFlashcard,
  getSubjects, createSubject, updateSubject, deleteSubject,
  updateFolderSubject, updateDeckFolder, moveFlashcardToDeck,
  Folder, Deck, Flashcard, Subject
} from "../services/db";
import { stateLabel } from "../services/fsrs";
import { 
  Plus, Trash2, Edit3, Sparkles, BookOpen, ChevronRight, FileText, X
} from "lucide-react";
import MathText from "../components/MathText";
import EmojiPicker from "../components/EmojiPicker";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";
import FolderNode from "../components/FolderNode";
import { acceptDrop, allowDrop, setDragData } from "../utils/dnd";
import { getFolderPathLabel, getRootFolders, getValidParentFolders } from "../utils/folderTree";

interface FoldersProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings' | 'tests' | 'scores';
    deckId?: string;
    folderId?: string;
    openModal?: 'subject' | 'folder' | 'deck';
  };
  setCurrentNav: (nav: any) => void;
  onSidebarRefresh: () => void;
}

export default function Folders({ currentNav, setCurrentNav, onSidebarRefresh }: FoldersProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ message: string; variant: StatusVariant } | null>(null);

  const showError = (message: string) => setBanner({ message, variant: "error" });

  const handleDragEnter = (targetId: string) => (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(targetId);
  };

  const handleDragLeave = (targetId: string) => (e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOverId((current) => (current === targetId ? null : current));
  };

  // Deck details view
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [deckCards, setDeckCards] = useState<Flashcard[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Modals / forms state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderIcon, setFolderIcon] = useState("📁");
  const [folderSubjectId, setFolderSubjectId] = useState<string>("none");
  const [folderParentId, setFolderParentId] = useState<string>("none");
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  const [showDeckModal, setShowDeckModal] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckIcon, setDeckIcon] = useState("🎴");
  const [deckDesc, setDeckDesc] = useState("");
  const [deckFolderId, setDeckFolderId] = useState<string>("");
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);

  // Subject modal state
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [subjectIcon, setSubjectIcon] = useState("📚");
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Flashcard forms state
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [cardTags, setCardTags] = useState("");
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  useEffect(() => {
    loadData();
  }, [currentNav.deckId, currentNav.folderId]);

  useEffect(() => {
    const handleRefresh = () => {
      loadData();
    };
    window.addEventListener("oxide-deck-db-refresh", handleRefresh);
    return () => window.removeEventListener("oxide-deck-db-refresh", handleRefresh);
  }, []);

  useEffect(() => {
    if (!currentNav.openModal) return;

    if (currentNav.openModal === 'subject') {
      setEditingSubject(null);
      setSubjectName("");
      setSubjectIcon("📚");
      setShowSubjectModal(true);
    } else if (currentNav.openModal === 'folder') {
      setEditingFolder(null);
      setFolderName("");
      setFolderIcon("📁");
      setFolderSubjectId("none");
      setFolderParentId("none");
      setShowFolderModal(true);
    } else if (currentNav.openModal === 'deck') {
      setEditingDeck(null);
      setDeckName("");
      setDeckIcon("🎴");
      setDeckDesc("");
      setDeckFolderId(folders[0]?.id || "none");
      setShowDeckModal(true);
    }

    setCurrentNav((prev: any) => ({ ...prev, openModal: undefined }));
  }, [currentNav.openModal, folders, setCurrentNav]);

  const loadData = async () => {
    try {
      setLoading(true);
      const f = await getFolders();
      const d = await getDecks();
      const s = await getSubjects();
      setFolders(f);
      setDecks(d);
      setSubjects(s);

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
      const parentIdVal = folderParentId === "none" || !folderParentId ? null : folderParentId;
      const parentFolder = parentIdVal ? folders.find((f) => f.id === parentIdVal) : null;
      // Nested folders inherit the parent's subject
      const subjectIdVal = parentFolder
        ? parentFolder.subject_id
        : folderSubjectId === "none" || !folderSubjectId
          ? null
          : folderSubjectId;

      if (editingFolder) {
        await updateFolder(
          editingFolder.id,
          folderName,
          folderIcon,
          editingFolder.color,
          subjectIdVal,
          parentIdVal
        );
      } else {
        await createFolder(folderName, folderIcon, "#37352f", subjectIdVal, parentIdVal);
      }
      setFolderName("");
      setFolderIcon("📁");
      setFolderSubjectId("none");
      setFolderParentId("none");
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
    setFolderSubjectId(folder.subject_id || "none");
    setFolderParentId(folder.parent_folder_id || "none");
    setShowFolderModal(true);
  };

  const openAddSubfolder = (parent: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(null);
    setFolderName("");
    setFolderIcon("📁");
    setFolderSubjectId(parent.subject_id || "none");
    setFolderParentId(parent.id);
    setShowFolderModal(true);
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return;
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, subjectName, subjectIcon, editingSubject.color);
      } else {
        await createSubject(subjectName, subjectIcon);
      }
      setSubjectName("");
      setSubjectIcon("📚");
      setEditingSubject(null);
      setShowSubjectModal(false);
      onSidebarRefresh();
      loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to save subject: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleDeleteSubjectClick = async (subjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this subject? Folders inside will NOT be deleted, they will become unassigned.")) return;
    try {
      await deleteSubject(subjectId);
      onSidebarRefresh();
      loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to delete subject: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const openEditSubject = (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject(subject);
    setSubjectName(subject.name);
    setSubjectIcon(subject.icon || "📚");
    setShowSubjectModal(true);
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
                  gap: "10px",
                  cursor: "grab"
                }}
                draggable
                onDragStart={(e) => setDragData(e, "flashcard", card.id)}
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
            setEditingSubject(null);
            setSubjectName("");
            setSubjectIcon("📚");
            setShowSubjectModal(true);
          }}>
            <Plus size={16} /> New Subject
          </button>
          <button className="notion-btn secondary" onClick={() => {
            setEditingFolder(null);
            setFolderName("");
            setFolderIcon("📁");
            setFolderSubjectId("none");
            setFolderParentId("none");
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
        
        {/* Subjects List */}
        {subjects.map(subject => {
          const subjectFolders = getRootFolders(folders, subject.id);
          const isSubjectDragOver = dragOverId === subject.id;
          return (
            <div 
              key={subject.id} 
              style={{ 
                border: isSubjectDragOver ? "2px dashed var(--accent-color)" : "1px solid var(--border-color)", 
                borderRadius: "10px", 
                padding: "20px", 
                backgroundColor: isSubjectDragOver ? "var(--accent-light)" : "var(--bg-secondary)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                transition: "all var(--transition-fast)"
              }}
              onDragOver={allowDrop}
              onDragEnter={handleDragEnter(subject.id)}
              onDragLeave={handleDragLeave(subject.id)}
              onDrop={async (e) => {
                setDragOverId(null);
                const payload = acceptDrop(e, "folder");
                if (!payload) return;
                await updateFolderSubject(payload.id, subject.id);
                loadData();
                window.dispatchEvent(new Event("oxide-deck-db-refresh"));
              }}
            >
              <div 
                style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.8rem" }}>{subject.icon || "📚"}</span>
                  <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-title)" }}>{subject.name}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", backgroundColor: "var(--bg-primary)", padding: "2px 8px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                    {subjectFolders.length} folder{subjectFolders.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="theme-toggle-btn" onClick={(e) => openEditSubject(subject, e)}>
                    <Edit3 size={14} />
                  </button>
                  <button className="theme-toggle-btn" style={{ color: "var(--danger-color)" }} onClick={(e) => handleDeleteSubjectClick(subject.id, e)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingLeft: "16px", borderLeft: "2px solid var(--border-color)" }}>
                {subjectFolders.map(folder => (
                  <FolderNode
                    key={folder.id}
                    folder={folder}
                    folders={folders}
                    decks={decks}
                    dragOverId={dragOverId}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onClearDragOver={() => setDragOverId(null)}
                    onRefresh={loadData}
                    onEditFolder={openEditFolder}
                    onDeleteFolder={handleDeleteFolderClick}
                    onAddSubfolder={openAddSubfolder}
                    onEditDeck={openEditDeck}
                    onDeleteDeck={handleDeleteDeckClick}
                    onOpenDeck={(deckId) => setCurrentNav({ page: 'folders', deckId })}
                  />
                ))}

                {subjectFolders.length === 0 && (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
                    No folders inside this subject yet. Drop a folder here or create one.
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* Folders with no subject (Unassigned Folders) — always shown as a drop target */}
        <div 
          style={{ 
            border: dragOverId === "unassigned-folders-overview" ? "2px dashed var(--accent-color)" : "1px dashed var(--border-color)", 
            borderRadius: "10px", 
            padding: "20px", 
            backgroundColor: dragOverId === "unassigned-folders-overview" ? "var(--accent-light)" : "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            transition: "all var(--transition-fast)"
          }}
          onDragOver={allowDrop}
          onDragEnter={handleDragEnter("unassigned-folders-overview")}
          onDragLeave={handleDragLeave("unassigned-folders-overview")}
          onDrop={async (e) => {
            setDragOverId(null);
            const payload = acceptDrop(e, "folder");
            if (!payload) return;
            await updateFolderSubject(payload.id, null);
            loadData();
            window.dispatchEvent(new Event("oxide-deck-db-refresh"));
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.8rem" }}>📁</span>
            <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-title)" }}>Unassigned Folders</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", backgroundColor: "var(--bg-primary)", padding: "2px 8px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              {getRootFolders(folders, null).length} folder{getRootFolders(folders, null).length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {getRootFolders(folders, null).length === 0 && (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", fontStyle: "italic" }}>
                Drop a folder here to remove it from a subject
              </div>
            )}
            {getRootFolders(folders, null).map(folder => (
              <FolderNode
                key={folder.id}
                folder={folder}
                folders={folders}
                decks={decks}
                dragOverId={dragOverId}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onClearDragOver={() => setDragOverId(null)}
                onRefresh={loadData}
                onEditFolder={openEditFolder}
                onDeleteFolder={handleDeleteFolderClick}
                onAddSubfolder={openAddSubfolder}
                onEditDeck={openEditDeck}
                onDeleteDeck={handleDeleteDeckClick}
                onOpenDeck={(deckId) => setCurrentNav({ page: 'folders', deckId })}
              />
            ))}
          </div>
        </div>

{/* Uncategorized Decks — always shown as a drop target */}
        <div 
          style={{ 
            border: dragOverId === "unassigned-decks-overview" ? "2px dashed var(--accent-color)" : "1px solid var(--border-color)", 
            borderRadius: "10px", 
            overflow: "hidden", 
            backgroundColor: dragOverId === "unassigned-decks-overview" ? "var(--accent-light)" : "var(--bg-secondary)",
            transition: "all var(--transition-fast)"
          }}
          onDragOver={allowDrop}
          onDragEnter={handleDragEnter("unassigned-decks-overview")}
          onDragLeave={handleDragLeave("unassigned-decks-overview")}
          onDrop={async (e) => {
            setDragOverId(null);
                  const payload = acceptDrop(e, "deck");
                  if (!payload) return;
                  await updateDeckFolder(payload.id, null);
              loadData();
              window.dispatchEvent(new Event("oxide-deck-db-refresh"));
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
              {decks.filter(d => !d.folder_id).length === 0 && (
                <div style={{ gridColumn: "1/-1", padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", fontStyle: "italic" }}>
                  Drop a deck here to remove it from a folder
                </div>
              )}
              {decks.filter(d => !d.folder_id).map(deck => {
                const isDeckDragOver = dragOverId === deck.id;
                return (
                  <div 
                    key={deck.id} 
                    className="deck-card"
                    onClick={() => setCurrentNav({ page: 'folders', deckId: deck.id })}
                    style={{
                      border: isDeckDragOver ? "2px dashed var(--accent-color)" : undefined,
                      backgroundColor: isDeckDragOver ? "var(--accent-light)" : undefined,
                      cursor: "grab"
                    }}
                    draggable
                    onDragStart={(e) => setDragData(e, "deck", deck.id)}
                    onDragOver={allowDrop}
                    onDragEnter={handleDragEnter(deck.id)}
                    onDragLeave={handleDragLeave(deck.id)}
                    onDrop={async (e) => {
                      setDragOverId(null);
                                        const payload = acceptDrop(e, "flashcard");
                                        if (!payload) return;
                                        await moveFlashcardToDeck(payload.id, deck.id);
                        loadData();
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
                  );
                })}
              </div>
            </div>
          </div>

        {subjects.length === 0 && folders.length === 0 && decks.length === 0 && (
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
            No subjects, folders or decks found. Click <strong>New Subject</strong>, <strong>New Folder</strong> or <strong>New Deck</strong> to start mapping your revision sets!
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
                <div className="notion-input-group">
                  <label>Parent Folder</label>
                  <select 
                    className="notion-input"
                    value={folderParentId}
                    onChange={(e) => setFolderParentId(e.target.value)}
                  >
                    <option value="none">Top level (no parent folder)</option>
                    {getValidParentFolders(folders, editingFolder?.id).map(f => (
                      <option key={f.id} value={f.id}>{getFolderPathLabel(folders, f.id)}</option>
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
                        {subjects.map(s => (
                          <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                        ))}
                      </>
                    )}
                  </select>
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
                      <option key={f.id} value={f.id}>{getFolderPathLabel(folders, f.id)}</option>
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

      {/* Subject Creation Modal */}
      {showSubjectModal && (
        <div className="notion-modal-overlay">
          <div className="notion-modal">
            <div className="notion-modal-header">
              <span className="notion-modal-title">{editingSubject ? "Edit Subject" : "Create Subject"}</span>
              <button className="theme-toggle-btn" onClick={() => setShowSubjectModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSubject}>
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
                <button type="button" className="notion-btn secondary" onClick={() => setShowSubjectModal(false)}>Cancel</button>
                <button type="submit" className="notion-btn">{editingSubject ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
