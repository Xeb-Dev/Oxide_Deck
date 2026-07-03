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
  X
} from "lucide-react";
import { getFolders, getDecks, Folder, Deck } from "../services/db";

interface LayoutProps {
  currentNav: {
    page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings';
    deckId?: string;
    folderId?: string;
    revisionMode?: 'flashcard' | 'quiz' | 'teach';
  };
  setCurrentNav: (nav: any) => void;
  children: React.ReactNode;
  refreshTrigger: number; // to reload sidebar when folders/decks change
}

export default function Layout({ currentNav, setCurrentNav, children, refreshTrigger }: LayoutProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
      setFolders(f);
      setDecks(d);
    } catch (e) {
      console.error("Failed to load sidebar folders/decks:", e);
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
                title="Manage Folders"
              >
                <Plus size={12} />
              </button>
            </div>

            {/* Folders List */}
            {folders.map(folder => {
              const isOpen = !!expandedFolders[folder.id];
              const folderDecks = decks.filter(d => d.folder_id === folder.id);

              return (
                <div key={folder.id} style={{ display: "flex", flexDirection: "column" }}>
                  <div 
                    className="sidebar-item" 
                    style={{ justifyContent: "space-between" }}
                    onClick={() => handleNav({ page: 'folders', folderId: folder.id })}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>{folder.icon || "📁"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                        {folder.name}
                      </span>
                    </div>
                    <button 
                      className="sidebar-item-arrow-btn"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center" }}
                      onClick={(e) => toggleFolder(folder.id, e)}
                    >
                      <ChevronRight 
                        size={14} 
                        className={`sidebar-item-arrow ${isOpen ? 'open' : ''}`} 
                      />
                    </button>
                  </div>

                  {/* Sub Decks */}
                  {isOpen && (
                    <div className="sidebar-sub-list">
                      {folderDecks.map(deck => (
                        <div 
                          key={deck.id}
                          className={`sidebar-item ${currentNav.deckId === deck.id ? 'active' : ''}`}
                          onClick={() => handleNav({ page: 'folders', deckId: deck.id })}
                          style={{ fontSize: "0.82rem", padding: "4px 8px" }}
                        >
                          <span>{deck.icon || "🎴"}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {deck.name}
                          </span>
                        </div>
                      ))}
                      {folderDecks.length === 0 && (
                        <div style={{ padding: "4px 8px", fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                          No decks
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Uncategorized Decks */}
            {decks.filter(d => !d.folder_id).map(deck => (
              <div 
                key={deck.id}
                className={`sidebar-item ${currentNav.deckId === deck.id ? 'active' : ''}`}
                onClick={() => handleNav({ page: 'folders', deckId: deck.id })}
              >
                <span>{deck.icon || "🎴"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deck.name}
                </span>
              </div>
            ))}
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
