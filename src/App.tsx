import { useState } from "react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Folders from "./pages/Folders";
import CreateFlashcard from "./pages/CreateFlashcard";
import Revision from "./pages/Revision";
import SettingsPage from "./pages/Settings";
import TestPage from "./pages/Test";
import ScoresPage from "./pages/Scores";
import MockExamPage from "./pages/MockExam";
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

  const handleNavChange = (newNav: NavigationState) => {
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
