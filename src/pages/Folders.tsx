import React, { useEffect, useState } from "react";
import {
  getFolders,
  getDecks,
  createFolder,
  createDeck,
  deleteFolder,
  deleteDeck,
  updateFolder,
  updateDeck,
  getFlashcards,
  createFlashcard,
  deleteFlashcard,
  updateFlashcard,
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  updateFolderSubject,
  updateDeckFolder,
  moveFlashcardToDeck,
  Folder,
  Deck,
  Flashcard,
  Subject,
} from "../services/db";
import {
  Plus,
  Trash2,
  Edit3,
  Upload,
  QrCode,
  Download,
} from "lucide-react";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";
import FolderNode from "../components/FolderNode";
import QrShareModal from "../components/QrShareModal";
import QrScanModal from "../components/QrScanModal";
import { acceptDrop, allowDrop, setDragData } from "../utils/dnd";
import { getRootFolders } from "../utils/folderTree";
import { exportDeck, exportFolder, exportSubject, importOxidePackage } from "../services/exportImport";
import SubjectModal from "./folders/SubjectModal";
import FolderModal from "./folders/FolderModal";
import DeckModal from "./folders/DeckModal";
import CardModal from "./folders/CardModal";
import DeckDetailView from "./folders/DeckDetailView";

interface FoldersProps {
  currentNav: {
    page: "dashboard" | "folders" | "create" | "revision" | "settings" | "tests" | "scores" | "mock";
    deckId?: string;
    folderId?: string;
    openModal?: "subject" | "folder" | "deck";
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

  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [deckCards, setDeckCards] = useState<Flashcard[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderModalInitialParentId, setFolderModalInitialParentId] = useState("none");
  const [folderModalInitialSubjectId, setFolderModalInitialSubjectId] = useState("none");

  const [showDeckModal, setShowDeckModal] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);

  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);

  // QR Code Modals
  const [qrShareItem, setQrShareItem] = useState<{
    itemType: "deck" | "folder" | "subject";
    itemId: string;
    itemName: string;
    itemIcon: string;
  } | null>(null);
  const [qrScanModalOpen, setQrScanModalOpen] = useState(false);

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

  useEffect(() => {
    loadData(true);
  }, [currentNav.deckId, currentNav.folderId]);

  useEffect(() => {
    const handleRefresh = () => {
      loadData(false);
    };
    window.addEventListener("oxide-deck-db-refresh", handleRefresh);
    return () => window.removeEventListener("oxide-deck-db-refresh", handleRefresh);
  }, []);

  useEffect(() => {
    if (!currentNav.openModal) return;

    if (currentNav.openModal === "subject") {
      setEditingSubject(null);
      setShowSubjectModal(true);
    } else if (currentNav.openModal === "folder") {
      setEditingFolder(null);
      setFolderModalInitialParentId("none");
      setFolderModalInitialSubjectId("none");
      setShowFolderModal(true);
    } else if (currentNav.openModal === "deck") {
      setEditingDeck(null);
      setShowDeckModal(true);
    }

    setCurrentNav((prev: any) => ({ ...prev, openModal: undefined }));
  }, [currentNav.openModal, setCurrentNav]);

  const loadData = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const f = await getFolders();
      const d = await getDecks();
      const s = await getSubjects();
      setFolders(f);
      setDecks(d);
      setSubjects(s);

      // Handle direct deck display from sidebar click
      if (currentNav.deckId) {
        const deck = d.find((x) => x.id === currentNav.deckId);
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
      if (showSpinner) setLoading(false);
    }
  };

  const handleSaveSubject = async (name: string, icon: string) => {
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, name, icon, editingSubject.color);
      } else {
        await createSubject(name, icon);
      }
      setEditingSubject(null);
      onSidebarRefresh();
      await loadData();
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

  const handleSaveFolder = async (
    name: string,
    icon: string,
    subjectId: string | null,
    parentId: string | null
  ) => {
    try {
      if (editingFolder) {
        await updateFolder(
          editingFolder.id,
          name,
          icon,
          editingFolder.color,
          subjectId,
          parentId
        );
      } else {
        await createFolder(name, icon, "#37352f", subjectId, parentId);
      }
      setEditingFolder(null);
      onSidebarRefresh();
      await loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to save folder: " + (e instanceof Error ? e.message : String(e)));
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

  const handleSaveDeck = async (
    name: string,
    icon: string,
    description: string,
    folderId: string | null
  ) => {
    try {
      if (editingDeck) {
        await updateDeck(editingDeck.id, name, icon, description, folderId);
      } else {
        await createDeck(name, folderId, icon, description);
      }
      setEditingDeck(null);
      onSidebarRefresh();
      await loadData();
    } catch (e) {
      console.error(e);
      showError("Failed to save deck: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleDeleteDeckClick = async (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this deck and all flashcards inside it?")) return;
    try {
      await deleteDeck(deckId);
      onSidebarRefresh();
      if (currentNav.deckId === deckId) {
        setCurrentNav({ page: "folders" });
      } else {
        loadData();
      }
    } catch (e) {
      console.error(e);
      showError("Failed to delete deck: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleSaveCard = async (
    front: string,
    back: string,
    tags: string,
    frontImg: string | null,
    backImg: string | null
  ) => {
    if (!selectedDeck) return;
    try {
      if (editingCard) {
        await updateFlashcard(editingCard.id, front, back, tags, null, frontImg, backImg);
      } else {
        await createFlashcard(selectedDeck.id, front, back, tags, null, frontImg, backImg);
      }
      setEditingCard(null);
      const cards = await getFlashcards(selectedDeck.id);
      setDeckCards(cards);
    } catch (e) {
      console.error(e);
      showError("Failed to save flashcard: " + (e instanceof Error ? e.message : String(e)));
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

  const handleExportDeck = async (deckId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setBanner({ message: "Exporting deck archive (.oxdeck)...", variant: "info" });
      const filename = await exportDeck(deckId);
      setBanner({ message: `Exported deck successfully as "${filename}"!`, variant: "success" });
    } catch (err: any) {
      console.error(err);
      showError("Failed to export deck: " + (err.message || String(err)));
    }
  };

  const handleExportFolder = async (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setBanner({ message: "Exporting folder archive (.oxfolder)...", variant: "info" });
      const filename = await exportFolder(folderId);
      setBanner({ message: `Exported folder successfully as "${filename}"!`, variant: "success" });
    } catch (err: any) {
      console.error(err);
      showError("Failed to export folder: " + (err.message || String(err)));
    }
  };

  const handleExportSubject = async (subjectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setBanner({ message: "Exporting subject archive (.oxsubject)...", variant: "info" });
      const filename = await exportSubject(subjectId);
      setBanner({ message: `Exported subject successfully as "${filename}"!`, variant: "success" });
    } catch (err: any) {
      console.error(err);
      showError("Failed to export subject: " + (err.message || String(err)));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBanner({ message: `Importing package "${file.name}"...`, variant: "info" });
      const msg = await importOxidePackage(file);
      setBanner({ message: msg, variant: "success" });
      await loadData();
      window.dispatchEvent(new Event("oxide-deck-db-refresh"));
      if (onSidebarRefresh) onSidebarRefresh();
    } catch (err: any) {
      console.error(err);
      showError("Import failed: " + (err.message || String(err)));
    } finally {
      e.target.value = "";
    }
  };

  const handleQrShareDeck = (deck: Deck, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setQrShareItem({
      itemType: "deck",
      itemId: deck.id,
      itemName: deck.name,
      itemIcon: deck.icon || "🎴",
    });
  };

  const handleQrShareFolder = (folder: Folder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setQrShareItem({
      itemType: "folder",
      itemId: folder.id,
      itemName: folder.name,
      itemIcon: folder.icon || "📁",
    });
  };

  const handleQrShareSubject = (subjectId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const subj = subjects.find((s) => s.id === subjectId);
    if (!subj) return;
    setQrShareItem({
      itemType: "subject",
      itemId: subj.id,
      itemName: subj.name,
      itemIcon: subj.icon || "📚",
    });
  };

  const openEditSubject = (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject(subject);
    setShowSubjectModal(true);
  };

  const openAddFolderToSubject = (subject: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(null);
    setFolderModalInitialSubjectId(subject.id);
    setFolderModalInitialParentId("none");
    setShowFolderModal(true);
  };

  const openEditFolder = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setShowFolderModal(true);
  };

  const openAddSubfolder = (parent: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(null);
    setFolderModalInitialSubjectId(parent.subject_id || "none");
    setFolderModalInitialParentId(parent.id);
    setShowFolderModal(true);
  };

  const openEditDeck = (deck: Deck, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDeck(deck);
    setShowDeckModal(true);
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
        <DeckDetailView
          selectedDeck={selectedDeck}
          deckCards={deckCards}
          onNavigateBack={() => setCurrentNav({ page: "folders" })}
          onNavigateRevision={(mode) =>
            setCurrentNav({ page: "revision", deckId: selectedDeck.id, revisionMode: mode })
          }
          onQrShare={() => handleQrShareDeck(selectedDeck)}
          onExport={() => handleExportDeck(selectedDeck.id)}
          onAddCard={() => {
            setEditingCard(null);
            setShowCardModal(true);
          }}
          onEditCard={(card) => {
            setEditingCard(card);
            setShowCardModal(true);
          }}
          onDeleteCard={handleDeleteCardClick}
        />

        <CardModal
          editingCard={editingCard}
          isOpen={showCardModal}
          onClose={() => setShowCardModal(false)}
          onSave={handleSaveCard}
          onShowBanner={(message, variant) => setBanner({ message, variant })}
        />
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
      <input
        type="file"
        id="oxide-package-import-input"
        accept=".oxdeck,.oxfolder,.oxsubject,.json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />
      <div className="page-header-row">
        <div>
          <div className="page-emoji">📁</div>
          <h1 className="page-title">Folders & Decks</h1>
          <p className="sub-description">
            Organize your learning workspaces. Group card decks inside dedicated folders.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            className="notion-btn secondary"
            title="Scan or paste encrypted QR Code payload"
            onClick={() => setQrScanModalOpen(true)}
          >
            <QrCode size={16} /> Import via QR
          </button>
          <button
            className="notion-btn secondary"
            title="Import .oxdeck, .oxfolder, or .oxsubject package"
            onClick={() => document.getElementById("oxide-package-import-input")?.click()}
          >
            <Upload size={16} /> Import Package
          </button>
          <button
            className="notion-btn secondary"
            onClick={() => {
              setEditingSubject(null);
              setShowSubjectModal(true);
            }}
          >
            <Plus size={16} /> New Subject
          </button>
          <button
            className="notion-btn secondary"
            onClick={() => {
              setEditingFolder(null);
              setFolderModalInitialParentId("none");
              setFolderModalInitialSubjectId("none");
              setShowFolderModal(true);
            }}
          >
            <Plus size={16} /> New Folder
          </button>
          <button
            className="notion-btn"
            onClick={() => {
              setEditingDeck(null);
              setShowDeckModal(true);
            }}
          >
            <Plus size={16} /> New Deck
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* Grid structure of folders */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Subjects List */}
        {subjects.map((subject) => {
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
                transition: "all var(--transition-fast)",
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
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.8rem" }}>{subject.icon || "📚"}</span>
                  <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-title)" }}>
                    {subject.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      backgroundColor: "var(--bg-primary)",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {subjectFolders.length} folder{subjectFolders.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="theme-toggle-btn"
                    title="Add folder to this subject"
                    onClick={(e) => openAddFolderToSubject(subject, e)}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="theme-toggle-btn"
                    title="Share Subject via Encrypted QR Code"
                    onClick={(e) => handleQrShareSubject(subject.id, e)}
                  >
                    <QrCode size={14} />
                  </button>
                  <button
                    className="theme-toggle-btn"
                    title="Export Subject (.oxsubject)"
                    onClick={(e) => handleExportSubject(subject.id, e)}
                  >
                    <Download size={14} />
                  </button>
                  <button className="theme-toggle-btn" onClick={(e) => openEditSubject(subject, e)} title="Edit subject">
                    <Edit3 size={14} />
                  </button>
                  <button
                    className="theme-toggle-btn"
                    style={{ color: "var(--danger-color)" }}
                    onClick={(e) => handleDeleteSubjectClick(subject.id, e)}
                    title="Delete subject"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                  paddingLeft: "16px",
                  borderLeft: "2px solid var(--border-color)",
                }}
              >
                {subjectFolders.map((folder) => (
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
                    onOpenDeck={(deckId) => setCurrentNav({ page: "folders", deckId })}
                    onExportFolder={handleExportFolder}
                    onExportDeck={handleExportDeck}
                    onQrShareFolder={handleQrShareFolder}
                    onQrShareDeck={handleQrShareDeck}
                  />
                ))}

                {subjectFolders.length === 0 && (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: "0.9rem",
                      fontStyle: "italic",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span>No folders inside this subject yet. Drop a folder here or create one.</span>
                    <button
                      className="notion-btn secondary"
                      style={{ fontSize: "0.8rem", padding: "4px 10px", marginTop: "2px" }}
                      onClick={(e) => openAddFolderToSubject(subject, e)}
                    >
                      <Plus size={13} /> Add Folder
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Folders with no subject (Unassigned Folders) */}
        <div
          style={{
            border: dragOverId === "unassigned-folders-overview" ? "2px dashed var(--accent-color)" : "1px dashed var(--border-color)",
            borderRadius: "10px",
            padding: "20px",
            backgroundColor: dragOverId === "unassigned-folders-overview" ? "var(--accent-light)" : "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            transition: "all var(--transition-fast)",
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
            <span style={{ fontWeight: 700, fontSize: "1.2rem", fontFamily: "var(--font-title)" }}>
              Unassigned Folders
            </span>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-primary)",
                padding: "2px 8px",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
              }}
            >
              {getRootFolders(folders, null).length} folder{getRootFolders(folders, null).length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {getRootFolders(folders, null).length === 0 && (
              <div style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", fontStyle: "italic" }}>
                Drop a folder here to remove it from a subject
              </div>
            )}
            {getRootFolders(folders, null).map((folder) => (
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
                onOpenDeck={(deckId) => setCurrentNav({ page: "folders", deckId })}
                onExportFolder={handleExportFolder}
                onExportDeck={handleExportDeck}
                onQrShareFolder={handleQrShareFolder}
                onQrShareDeck={handleQrShareDeck}
              />
            ))}
          </div>
        </div>

        {/* Uncategorized Decks */}
        <div
          style={{
            border: dragOverId === "unassigned-decks-overview" ? "2px dashed var(--accent-color)" : "1px solid var(--border-color)",
            borderRadius: "10px",
            overflow: "hidden",
            backgroundColor: dragOverId === "unassigned-decks-overview" ? "var(--accent-light)" : "var(--bg-secondary)",
            transition: "all var(--transition-fast)",
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
              backgroundColor: "var(--bg-hover)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.5rem" }}>🗃️</span>
              <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Uncategorized Decks</span>
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            <div className="decks-grid">
              {decks.filter((d) => !d.folder_id).length === 0 && (
                <div
                  style={{
                    gridColumn: "1/-1",
                    padding: "12px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "0.88rem",
                    fontStyle: "italic",
                  }}
                >
                  Drop a deck here to remove it from a folder
                </div>
              )}
              {decks
                .filter((d) => !d.folder_id)
                .map((deck) => {
                  const isDeckDragOver = dragOverId === deck.id;
                  return (
                    <div
                      key={deck.id}
                      className="deck-card"
                      onClick={() => setCurrentNav({ page: "folders", deckId: deck.id })}
                      style={{
                        border: isDeckDragOver ? "2px dashed var(--accent-color)" : undefined,
                        backgroundColor: isDeckDragOver ? "var(--accent-light)" : undefined,
                        cursor: "grab",
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
              fontSize: "0.95rem",
            }}
          >
            No subjects, folders or decks found. Click <strong>New Subject</strong>, <strong>New Folder</strong> or <strong>New Deck</strong> to start mapping your revision sets!
          </div>
        )}
      </div>

      {/* Modals */}
      <FolderModal
        editingFolder={editingFolder}
        initialParentId={folderModalInitialParentId}
        initialSubjectId={folderModalInitialSubjectId}
        isOpen={showFolderModal}
        folders={folders}
        subjects={subjects}
        onClose={() => setShowFolderModal(false)}
        onSave={handleSaveFolder}
      />

      <DeckModal
        editingDeck={editingDeck}
        isOpen={showDeckModal}
        folders={folders}
        onClose={() => setShowDeckModal(false)}
        onSave={handleSaveDeck}
      />

      <SubjectModal
        editingSubject={editingSubject}
        isOpen={showSubjectModal}
        onClose={() => setShowSubjectModal(false)}
        onSave={handleSaveSubject}
      />

      {qrShareItem && (
        <QrShareModal
          itemType={qrShareItem.itemType}
          itemId={qrShareItem.itemId}
          itemName={qrShareItem.itemName}
          itemIcon={qrShareItem.itemIcon}
          onClose={() => setQrShareItem(null)}
        />
      )}

      {qrScanModalOpen && (
        <QrScanModal
          onClose={() => setQrScanModalOpen(false)}
          onSuccess={(msg) => {
            setBanner({ message: msg, variant: "success" });
            loadData();
            window.dispatchEvent(new Event("oxide-deck-db-refresh"));
            if (onSidebarRefresh) onSidebarRefresh();
          }}
        />
      )}
    </>
  );
}
