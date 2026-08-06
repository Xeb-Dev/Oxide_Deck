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
}

import ToastBanner from "./components/ToastBanner";

function App() {
  const [currentNav, setCurrentNav] = useState<NavigationState>({
    page: 'dashboard'
  });
  
  // A refresh counter to trigger sidebar reloads when database updates occur (adding folders/decks)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);

  const triggerSidebarRefresh = () => {
    setSidebarRefreshTrigger(prev => prev + 1);
  };

  const handleNavChange = (newNav: NavigationState) => {
    setCurrentNav(newNav);
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
        return <CreateFlashcard onSidebarRefresh={triggerSidebarRefresh} />;
      case 'revision':
        return <Revision currentNav={currentNav} setCurrentNav={handleNavChange} />;
      case 'tests':
        return <TestPage currentNav={currentNav} setCurrentNav={handleNavChange} />;
      case 'mock':
        return <MockExamPage currentNav={currentNav} setCurrentNav={handleNavChange} />;
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
