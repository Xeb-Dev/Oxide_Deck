import { useState, useEffect } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Folders from "./pages/Folders";
import CreateFlashcard from "./pages/CreateFlashcard";
import Revision from "./pages/Revision";
import SettingsPage from "./pages/Settings";
import TestPage from "./pages/Test";
import ScoresPage from "./pages/Scores";
import MockExamPage from "./pages/MockExam";
import { loadWebDavConfig, getSyncIntervalSeconds } from "./services/webdavService";
import {
  performWebDAVSync,
  performOptimizedPeriodicSync,
  triggerBackgroundSyncIfEnabled,
} from "./services/syncEngine";
import "./App.css";

interface NavigationState {
  page: 'dashboard' | 'folders' | 'create' | 'revision' | 'settings' | 'tests' | 'scores' | 'mock';
  deckId?: string;
  folderId?: string;
  subjectId?: string;
  revisionMode?: 'flashcard' | 'quiz' | 'teach';
  openModal?: 'subject' | 'folder' | 'deck';
  createTab?: 'manual' | 'ai-text' | 'ai-url' | 'ai-camera' | 'ai-pdf';
}

import ToastBanner from "./components/ToastBanner";
import ConfirmModal from "./components/ConfirmModal";

function App() {
  const [currentNav, setCurrentNav] = useState<NavigationState>({
    page: 'dashboard'
  });
  
  const [isMockExamActive, setIsMockExamActive] = useState(false);
  const [pendingNav, setPendingNav] = useState<NavigationState | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // A refresh counter to trigger sidebar reloads when database updates occur (adding folders/decks)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);

  const triggerSidebarRefresh = () => {
    setSidebarRefreshTrigger(prev => prev + 1);
  };

  // Background WebDAV Auto-Sync on Launch
  useEffect(() => {
    const webdavConfig = loadWebDavConfig();
    if (
      webdavConfig.enabled &&
      webdavConfig.autoSyncOnLaunch &&
      webdavConfig.serverUrl.trim() &&
      webdavConfig.username.trim()
    ) {
      performWebDAVSync()
        .then((res) => {
          if (res.success) {
            triggerSidebarRefresh();
          }
        })
        .catch((e) => console.warn("Background auto-sync on launch failed:", e));
    }
  }, []);

  // Background Periodic WebDAV Interval Sync (Optimized Differential Change Detection)
  useEffect(() => {
    let timer: any = null;
    let currentIntervalSec = -1;
    let currentEnabled = false;

    const setupInterval = () => {
      const webdavConfig = loadWebDavConfig();
      const intervalSec = getSyncIntervalSeconds(webdavConfig);
      const isEnabled = Boolean(
        webdavConfig.enabled &&
        webdavConfig.serverUrl.trim() &&
        webdavConfig.username.trim()
      );

      // Only restart timer if interval or enabled state actually changed
      if (
        intervalSec === currentIntervalSec &&
        isEnabled === currentEnabled &&
        timer !== null
      ) {
        return;
      }

      currentIntervalSec = intervalSec;
      currentEnabled = isEnabled;

      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      if (intervalSec <= 0 || !isEnabled) {
        return;
      }

      const intervalMs = intervalSec * 1000;
      timer = setInterval(() => {
        performOptimizedPeriodicSync()
          .then((res) => {
            if (res.success && res.stats) {
              triggerSidebarRefresh();
            }
          })
          .catch((e) => console.warn("Periodic WebDAV interval sync failed:", e));
      }, intervalMs);
    };

    setupInterval();

    const handleConfigChange = () => {
      setupInterval();
    };

    window.addEventListener("webdav-config-changed", handleConfigChange);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("webdav-config-changed", handleConfigChange);
    };
  }, []);

  // Global listener for sync completions to refresh sidebar folders and deck trees
  useEffect(() => {
    const handleSyncComplete = (e: any) => {
      if (e?.detail?.success) {
        triggerSidebarRefresh();
      }
    };
    window.addEventListener("webdav-sync-completed", handleSyncComplete);
    return () => {
      window.removeEventListener("webdav-sync-completed", handleSyncComplete);
    };
  }, []);

  const handleNavChange = (newNav: NavigationState) => {
    if (currentNav.page === 'revision' && newNav.page !== 'revision') {
      triggerBackgroundSyncIfEnabled("exit-revision");
    }

    if (isMockExamActive && newNav.page !== 'mock') {
      setPendingNav(newNav);
      setShowLeaveConfirm(true);
      return;
    }
    setCurrentNav(newNav);
  };

  const handleConfirmLeave = () => {
    setIsMockExamActive(false);
    setShowLeaveConfirm(false);
    if (pendingNav) {
      setCurrentNav(pendingNav);
      setPendingNav(null);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveConfirm(false);
    setPendingNav(null);
  };

  const renderContent = () => {
    switch (currentNav.page) {
      case 'dashboard':
        return <Dashboard setCurrentNav={handleNavChange} />;
      case 'folders':
        return (
          <Folders 
            currentNav={currentNav} 
            setCurrentNav={handleNavChange} 
            onSidebarRefresh={triggerSidebarRefresh} 
          />
        );
      case 'create':
        return (
          <CreateFlashcard 
            currentNav={currentNav} 
            onSidebarRefresh={triggerSidebarRefresh} 
          />
        );
      case 'revision':
        return <Revision currentNav={currentNav} setCurrentNav={handleNavChange} />;
      case 'tests':
        return <TestPage currentNav={currentNav} setCurrentNav={handleNavChange} />;
      case 'mock':
        return (
          <MockExamPage 
            currentNav={currentNav} 
            setCurrentNav={handleNavChange} 
            onExamActiveChange={setIsMockExamActive}
          />
        );
      case 'scores':
        return <ScoresPage setCurrentNav={handleNavChange} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard setCurrentNav={handleNavChange} />;
    }
  };

  return (
    <>
      <ToastBanner />
      <ConfirmModal
        isOpen={showLeaveConfirm}
        title="Leave Mock Exam?"
        message="Are you sure you want to navigate away? All your current answers, timer countdown, and unsubmitted progress will be lost."
        confirmLabel="Leave Exam"
        cancelLabel="Stay in Exam"
        variant="danger"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />
      <Layout 
        currentNav={currentNav} 
        setCurrentNav={handleNavChange} 
        refreshTrigger={sidebarRefreshTrigger}
      >
        {renderContent()}
      </Layout>
    </>
  );
}

export default App;
