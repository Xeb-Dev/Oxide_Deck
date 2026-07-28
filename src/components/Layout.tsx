import React, { useEffect, useState } from "react";
import { 
  Home, 
  FolderClosed, 
  Settings, 
  Plus, 
  ChevronRight, 
  Sun, 
  Moon,
  Sparkles,
  BookOpen,
  Menu,
  X,
  FileText,
  TrendingUp
} from "lucide-react";
import { getFolders, getDecks, getSubjects, Folder, Deck, Subject, updateFolderSubject, updateDeckFolder, moveFlashcardToDeck } from "../services/db";
import { acceptDrop, allowDrop, setDragData } from "../utils/dnd";
import { getRootFolders } from "../utils/folderTree";
import SidebarFolderItem from "./SidebarFolderItem";

interface LayoutProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings' | 'tests' | 'scores';
    deckId?: string;
    folderId?: string;
    subjectId?: string;
    revisionMode?: 'flashcard' | 'quiz' | 'teach';
    openModal?: 'subject' | 'folder' | 'deck';
  };
  setCurrentNav: (nav: any) => void;
  children: React.ReactNode;
  refreshTrigger: number; // to reload sidebar when folders/decks change
}

export default function Layout({ currentNav, setCurrentNav, children, refreshTrigger }: LayoutProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const MOBILE_BREAKPOINT = 768;

  // Load theme and folders/decks on mount and refresh
  useEffect(() => {
    // Theme setup
    const savedTheme = localStorage.getItem("oxide_deck_theme") || "light";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDarkMode(false);
    }

    loadSidebarData();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleRefresh = () => {
      loadSidebarData();
    };
    window.addEventListener("oxide-deck-db-refresh", handleRefresh);
    return () => window.removeEventListener("oxide-deck-db-refresh", handleRefresh);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const mobile = event.matches;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isMobile, sidebarOpen]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleNav = (nav: LayoutProps["currentNav"]) => {
    setCurrentNav(nav);
    if (isMobile) {
      closeSidebar();
    }
  };

  const loadSidebarData = async () => {
    try {
      const f = await getFolders();
      const d = await getDecks();
      const s = await getSubjects();
      setFolders(f);
      setDecks(d);
      setSubjects(s);
    } catch (e) {
      console.error("Failed to load sidebar folders/decks/subjects:", e);
    }
  };

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("oxide_deck_theme", "light");
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("oxide_deck_theme", "dark");
      setIsDarkMode(true);
    }
  };

  const toggleFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const toggleSubject = (subjectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectId]: !prev[subjectId]
    }));
  };

  return (
    <div className={`app-container${sidebarOpen ? " sidebar-open" : ""}`}>
      {isMobile && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <span style={{ fontSize: "1.2rem" }}>⬡</span>
            <span>Oxide Deck</span>
          </div>
          <div className="sidebar-header-actions">
            {isMobile && (
              <button
                className="theme-toggle-btn sidebar-close-btn"
                onClick={closeSidebar}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            )}
            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <div className="sidebar-content">
          {/* Main Navigation */}
          <div className="sidebar-section">
            <div 
              className={`sidebar-item ${currentNav.page === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'dashboard' })}
            >
              <Home size={16} />
              <span>Dashboard</span>
            </div>
            <div 
              className={`sidebar-item ${currentNav.page === 'folders' && !currentNav.deckId ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'folders' })}
            >
              <FolderClosed size={16} />
              <span>Folders & Decks</span>
            </div>
            <div 
              className={`sidebar-item ${currentNav.page === 'create' ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'create' })}
            >
              <Plus size={16} />
              <span>Create Flashcards</span>
            </div>
            <div 
              className={`sidebar-item ${currentNav.page === 'tests' ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'tests' })}
            >
              <FileText size={16} />
              <span>Tests</span>
            </div>
            <div 
              className={`sidebar-item ${currentNav.page === 'scores' ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'scores' })}
            >
              <TrendingUp size={16} />
              <span>Scores & Analytics</span>
            </div>
            <div 
              className={`sidebar-item ${currentNav.page === 'settings' ? 'active' : ''}`}
              onClick={() => handleNav({ page: 'settings' })}
            >
              <Settings size={16} />
              <span>Settings</span>
            </div>
          </div>

          {/* Quick Access Folders Tree */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span>Workspace</span>
              <button 
                onClick={() => handleNav({ page: 'folders' })}
                title="Manage Workspace"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Subjects List */}
            {subjects.map(subject => {
              const isSubjectOpen = !!expandedSubjects[subject.id];
              const subjectFolders = getRootFolders(folders, subject.id);
              const isDragOver = dragOverId === subject.id;
              
              return (
                <div 
                  key={subject.id} 
                  style={{ display: "flex", flexDirection: "column" }}
                  onDragOver={allowDrop}
                  onDragEnter={handleDragEnter(subject.id)}
                  onDragLeave={handleDragLeave(subject.id)}
                  onDrop={async (e) => {
                    setDragOverId(null);
                    const payload = acceptDrop(e, "folder");
                    if (!payload) return;
                    await updateFolderSubject(payload.id, subject.id);
                      loadSidebarData();
                      window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                  }}
                >
                  <div 
                    className="sidebar-item" 
                    style={{ 
                      justifyContent: "space-between", 
                      fontWeight: 600,
                      border: isDragOver ? "2px dashed var(--accent-color)" : "none",
                      backgroundColor: isDragOver ? "var(--accent-light)" : undefined,
                      borderRadius: "6px"
                    }}
                    onClick={(e) => toggleSubject(subject.id, e)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>{subject.icon || "📚"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                        {subject.name}
                      </span>
                    </div>
                    <button 
                      className="sidebar-item-arrow-btn"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}
                      onClick={(e) => toggleSubject(subject.id, e)}
                    >
                      <ChevronRight 
                        size={14} 
                        className={`sidebar-item-arrow ${isSubjectOpen ? 'open' : ''}`} 
                      />
                    </button>
                  </div>

                  {/* Nested Folders */}
                  {isSubjectOpen && (
                    <div className="sidebar-sub-list" style={{ paddingLeft: "12px" }}>
                      {subjectFolders.map(folder => (
                        <SidebarFolderItem
                          key={folder.id}
                          folder={folder}
                          folders={folders}
                          decks={decks}
                          expandedFolders={expandedFolders}
                          dragOverId={dragOverId}
                          activeDeckId={currentNav.deckId}
                          onToggleFolder={toggleFolder}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onClearDragOver={() => setDragOverId(null)}
                          onRefresh={loadSidebarData}
                          onNavigateFolder={(folderId) => handleNav({ page: 'folders', folderId })}
                          onNavigateDeck={(deckId) => handleNav({ page: 'folders', deckId })}
                        />
                      ))}

                      {subjectFolders.length === 0 && (
                        <div style={{ padding: "4px 8px", fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                          No folders
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Independent Folders — always shown as a drop target */}
            <div 
              className="sidebar-section-title"
              onDragOver={allowDrop}
              onDragEnter={handleDragEnter("unassigned-folders")}
              onDragLeave={handleDragLeave("unassigned-folders")}
              onDrop={async (e) => {
                setDragOverId(null);
                  const payload = acceptDrop(e, "folder");
                  if (!payload) return;
                  await updateFolderSubject(payload.id, null);
                  loadSidebarData();
                  window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                  }}
              style={{
                padding: "4px 8px",
                border: dragOverId === "unassigned-folders" ? "2px dashed var(--accent-color)" : "none",
                backgroundColor: dragOverId === "unassigned-folders" ? "var(--accent-light)" : undefined,
                borderRadius: "4px",
                marginTop: "8px"
              }}
            >
              <span>Independent Folders</span>
            </div>

            {/* Unassigned Folders List */}
            {getRootFolders(folders, null).map(folder => (
              <SidebarFolderItem
                key={folder.id}
                folder={folder}
                          folders={folders}
                          decks={decks}
                          expandedFolders={expandedFolders}
                          dragOverId={dragOverId}
                          activeDeckId={currentNav.deckId}
                          onToggleFolder={toggleFolder}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onClearDragOver={() => setDragOverId(null)}
                          onRefresh={loadSidebarData}
                          onNavigateFolder={(folderId) => handleNav({ page: 'folders', folderId })}
                          onNavigateDeck={(deckId) => handleNav({ page: 'folders', deckId })}
              />
            ))}

            {/* Uncategorized Decks — always shown as a drop target */}
            <div 
              className="sidebar-section-title"
              onDragOver={allowDrop}
              onDragEnter={handleDragEnter("unassigned-decks")}
              onDragLeave={handleDragLeave("unassigned-decks")}
              onDrop={async (e) => {
                setDragOverId(null);
                  const payload = acceptDrop(e, "deck");
                  if (!payload) return;
                  await updateDeckFolder(payload.id, null);
                  loadSidebarData();
                  window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                  }}
              style={{
                padding: "4px 8px",
                border: dragOverId === "unassigned-decks" ? "2px dashed var(--accent-color)" : "none",
                backgroundColor: dragOverId === "unassigned-decks" ? "var(--accent-light)" : undefined,
                borderRadius: "4px",
                marginTop: "8px"
              }}
            >
              <span>Uncategorized Decks</span>
            </div>

            {/* Uncategorized Decks */}
            {decks.filter(d => !d.folder_id).map(deck => {
              const isDeckDragOver = dragOverId === deck.id;
              return (
                <div 
                  key={deck.id}
                  className={`sidebar-item ${currentNav.deckId === deck.id ? 'active' : ''}`}
                  onClick={() => handleNav({ page: 'folders', deckId: deck.id })}
                  style={{
                    border: isDeckDragOver ? "2px dashed var(--accent-color)" : "none",
                    backgroundColor: isDeckDragOver ? "var(--accent-light)" : undefined,
                    borderRadius: "4px"
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
                      window.dispatchEvent(new Event("oxide-deck-db-refresh"));
                  }}
                >
                  <span>{deck.icon || "🎴"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {deck.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <BookOpen size={12} />
            <span>Revision mode active</span>
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <main className="main-workspace">
        <header className="workspace-header">
          <div className="workspace-header-left">
            {isMobile && (
              <button
                className="sidebar-menu-btn theme-toggle-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="breadcrumbs">
              <span>Oxide Deck</span>
              <ChevronRight size={12} />
              <span className="current" style={{ textTransform: "capitalize" }}>
                {currentNav.page === 'folders' && currentNav.deckId 
                  ? 'Deck View' 
                  : currentNav.page}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button 
              className="notion-btn workspace-quick-scan-btn" 
              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={() => handleNav({ page: 'create' })}
            >
              <Sparkles size={12} />
              <span className="workspace-quick-scan-label">Quick Scan</span>
            </button>
          </div>
        </header>

        <div className="workspace-content">
          {children}
        </div>
      </main>
    </div>
  );
}
