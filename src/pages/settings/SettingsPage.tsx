import { useState, useEffect, useMemo } from "react";
import { Search, CheckCircle2 } from "lucide-react";
import { SETTINGS_TABS, SettingsTabId } from "./settingsConfig";
import AISettings from "./sections/AISettings";
import PersonaSettings from "./sections/PersonaSettings";
import NotificationSettings from "./sections/NotificationSettings";
import FSRSSettings from "./sections/FSRSSettings";
import WebDAVSyncSettings from "./sections/WebDAVSyncSettings";
import DataSettings from "./sections/DataSettings";
import StatusBanner, { StatusVariant } from "../../components/StatusBanner";
import { resetDatabase, getFSRSParameters, optimizeFSRSParameters, resetFSRSParameters, FsrsParametersInfo } from "../../services/db";
import { getAIConfig, getLearningPersonalities, LearningPersonality, saveLearningPersonalities, LLMTask, TaskAIConfig, getTaskAIConfig, saveTaskAIConfig } from "../../services/llm";
import { getNotificationSettings, saveNotificationSettings, requestNotificationPermission, triggerNotification, NotificationSettings as NotifSettingsType } from "../../services/notificationService";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('ai');
  const [searchQuery, setSearchQuery] = useState("");

  // AI Settings State
  const [provider, setProvider] = useState<'gemini' | 'groq' | 'local'>('gemini');
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-flash-lite");
  const [groqKey, setGroqKey] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [localUrl, setLocalUrl] = useState("http://localhost:1234/v1");
  const [localModel, setLocalModel] = useState("lmstudio-model");

  // Personas State
  const [personalities, setPersonalities] = useState<LearningPersonality[]>([]);

  // Task-Specific AI Routing State
  const [taskSettings, setTaskSettings] = useState<Record<LLMTask, TaskAIConfig>>({
    scan: { provider: 'global', model: '' },
    validate: { provider: 'global', model: '' },
    teach: { provider: 'global', model: '' },
    quiz: { provider: 'global', model: '' },
    test: { provider: 'global', model: '' },
  });

  // Notification Settings State
  const [notifSettings, setNotifSettings] = useState<NotifSettingsType>(getNotificationSettings());

  // FSRS State
  const [fsrsParams, setFsrsParams] = useState<FsrsParametersInfo | null>(null);
  const [fsrsBusy, setFsrsBusy] = useState(false);

  // Status & Save state
  const [saveStatus, setSaveStatus] = useState<{ message: string; variant: StatusVariant } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    const config = getAIConfig();
    setProvider(config.provider);
    setGeminiKey(config.geminiKey);
    setGeminiModel(config.geminiModel);
    setGroqKey(config.groqKey);
    setGroqModel(config.groqModel);
    setLocalUrl(config.localUrl);
    setLocalModel(config.localModel);
    setPersonalities(getLearningPersonalities());
    setNotifSettings(getNotificationSettings());

    setTaskSettings({
      scan: getTaskAIConfig('scan'),
      validate: getTaskAIConfig('validate'),
      teach: getTaskAIConfig('teach'),
      quiz: getTaskAIConfig('quiz'),
      test: getTaskAIConfig('test'),
    });

    setIsLoaded(true);
    getFSRSParameters().then(setFsrsParams).catch((e) => console.error("Failed to load FSRS params:", e));
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("oxide_deck_ai_provider", provider);
    localStorage.setItem("oxide_deck_gemini_key", geminiKey);
    localStorage.setItem("oxide_deck_gemini_model", geminiModel);
    localStorage.setItem("oxide_deck_groq_key", groqKey);
    localStorage.setItem("oxide_deck_groq_model", groqModel);
    localStorage.setItem("oxide_deck_local_url", localUrl);
    localStorage.setItem("oxide_deck_local_model", localModel);
    saveLearningPersonalities(personalities);
    saveNotificationSettings(notifSettings);

    saveTaskAIConfig('scan', taskSettings.scan);
    saveTaskAIConfig('validate', taskSettings.validate);
    saveTaskAIConfig('teach', taskSettings.teach);
    saveTaskAIConfig('quiz', taskSettings.quiz);
    saveTaskAIConfig('test', taskSettings.test);
  }, [provider, geminiKey, geminiModel, groqKey, groqModel, localUrl, localModel, personalities, taskSettings, notifSettings, isLoaded]);

  // Persona Handlers
  const handleUpdatePersonality = (id: string, field: 'name' | 'description', value: string) => {
    setPersonalities(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleAddPersonality = () => {
    setPersonalities(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Persona ${prev.length + 1}`,
        description: "Describe how this personality learns and what kind of feedback they need."
      }
    ]);
  };

  const handleRemovePersonality = (id: string) => {
    setPersonalities(prev => prev.filter(p => p.id !== id));
  };

  // Task Routing Handler
  const handleTaskSettingChange = (task: LLMTask, field: keyof TaskAIConfig, value: string) => {
    setTaskSettings(prev => ({
      ...prev,
      [task]: {
        ...prev[task],
        [field]: value
      }
    }));
  };

  // Notification Handlers
  const handleNotifChange = <K extends keyof NotifSettingsType>(key: K, value: NotifSettingsType[K]) => {
    setNotifSettings(prev => {
      const updated = { ...prev, [key]: value };
      saveNotificationSettings(updated);
      return updated;
    });

    if (key === "masterEnabled" && value === true) {
      requestNotificationPermission().catch(console.error);
    }
  };

  const handleTestNotif = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      setSaveStatus({ message: "Notification permission was not granted by your system.", variant: "warning" });
      return;
    }

    const sent = await triggerNotification(
      "🔔 Oxide Deck Notification Test",
      "Your notifications and study reminders are configured successfully!",
      "success"
    );

    if (sent) {
      setSaveStatus({ message: "Test notification sent!", variant: "success" });
    } else {
      setSaveStatus({ message: "Notification triggered (in-app toast emitted).", variant: "info" });
    }
  };

  // FSRS Handlers
  const handleOptimizeFSRS = async () => {
    try {
      setFsrsBusy(true);
      const result = await optimizeFSRSParameters();
      setSaveStatus({ message: result.message, variant: result.ok ? "success" : "warning" });
      setFsrsParams(await getFSRSParameters());
    } catch (e: any) {
      console.error(e);
      setSaveStatus({ message: e?.message || "FSRS optimization failed.", variant: "error" });
    } finally {
      setFsrsBusy(false);
    }
  };

  const handleResetFSRS = async () => {
    try {
      setFsrsBusy(true);
      await resetFSRSParameters();
      setFsrsParams(await getFSRSParameters());
      setSaveStatus({ message: "FSRS parameters reset to defaults.", variant: "success" });
    } catch (e: any) {
      console.error(e);
      setSaveStatus({ message: e?.message || "Failed to reset FSRS parameters.", variant: "error" });
    } finally {
      setFsrsBusy(false);
    }
  };

  // Database Reset Handler
  const handleResetDB = async () => {
    if (confirm("🚨 WARNING: This will permanently delete all folders, decks, flashcards, and revision statistics. This cannot be undone! Are you sure?")) {
      try {
        await resetDatabase();
        setSaveStatus({ message: "Database has been reset successfully. Refreshing...", variant: "success" });
        window.location.reload();
      } catch (e) {
        console.error(e);
        setSaveStatus({ message: "Database reset failed.", variant: "error" });
      }
    }
  };

  // Filter tabs matching search query
  const filteredTabs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SETTINGS_TABS;
    return SETTINGS_TABS.filter(tab =>
      tab.label.toLowerCase().includes(q) ||
      tab.description.toLowerCase().includes(q) ||
      tab.keywords.some(k => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // If active tab is filtered out by search, select first matching tab
  useEffect(() => {
    if (filteredTabs.length > 0 && !filteredTabs.some(t => t.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [filteredTabs, activeTab]);

  const activeTabConfig = SETTINGS_TABS.find(t => t.id === activeTab) || SETTINGS_TABS[0];

  return (
    <div className="settings-page-wrapper">
      {/* Page Header */}
      <div className="settings-header-banner">
        <div>
          <div className="page-emoji-title">
            <span className="page-emoji">⚙️</span>
            <h1 className="page-title">Settings</h1>
          </div>
          <p className="sub-description">
            Customize AI models, study schedule notifications, learning personas, and storage.
          </p>
        </div>

        <div className="settings-autosave-indicator">
          <CheckCircle2 size={15} />
          <span>Auto-saved</span>
        </div>
      </div>

      {saveStatus && (
        <div style={{ marginBottom: "16px" }}>
          <StatusBanner
            message={saveStatus.message}
            variant={saveStatus.variant}
            onDismiss={saveStatus.variant === "error" ? () => setSaveStatus(null) : undefined}
          />
        </div>
      )}

      {/* Settings Master-Detail Container */}
      <div className="settings-master-layout">
        {/* Left Sub-Sidebar / Nav */}
        <div className="settings-sidebar">
          {/* Search Box */}
          <div className="settings-search-box">
            <Search size={16} className="settings-search-icon" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="settings-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="settings-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="settings-nav-list" aria-label="Settings categories">
            {filteredTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`settings-nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="settings-nav-item-content">
                    <Icon size={18} className="settings-nav-item-icon" />
                    <span className="settings-nav-item-label">{tab.label}</span>
                  </div>
                  {tab.badge && <span className="settings-nav-item-badge">{tab.badge}</span>}
                </button>
              );
            })}

            {filteredTabs.length === 0 && (
              <div className="settings-no-results">
                No matching settings found
              </div>
            )}
          </nav>
        </div>

        {/* Right Content View */}
        <main className="settings-main-content">
          {/* Tab Header */}
          <div className="settings-tab-header">
            <div className="settings-tab-header-icon">
              <activeTabConfig.icon size={22} />
            </div>
            <div>
              <h2 className="settings-tab-title">{activeTabConfig.label}</h2>
              <p className="settings-tab-desc">{activeTabConfig.description}</p>
            </div>
          </div>

          {/* Tab Content Section */}
          <div className="settings-tab-body">
            {activeTab === 'ai' && (
              <AISettings
                provider={provider}
                setProvider={setProvider}
                geminiKey={geminiKey}
                setGeminiKey={setGeminiKey}
                geminiModel={geminiModel}
                setGeminiModel={setGeminiModel}
                groqKey={groqKey}
                setGroqKey={setGroqKey}
                groqModel={groqModel}
                setGroqModel={setGroqModel}
                localUrl={localUrl}
                setLocalUrl={setLocalUrl}
                localModel={localModel}
                setLocalModel={setLocalModel}
                taskSettings={taskSettings}
                onTaskSettingChange={handleTaskSettingChange}
              />
            )}

            {activeTab === 'personas' && (
              <PersonaSettings
                personalities={personalities}
                onAddPersonality={handleAddPersonality}
                onRemovePersonality={handleRemovePersonality}
                onUpdatePersonality={handleUpdatePersonality}
              />
            )}

            {activeTab === 'notifications' && (
              <NotificationSettings
                settings={notifSettings}
                onChange={handleNotifChange}
                onSendTestNotification={handleTestNotif}
              />
            )}

            {activeTab === 'fsrs' && (
              <FSRSSettings
                fsrsParams={fsrsParams}
                fsrsBusy={fsrsBusy}
                onOptimize={handleOptimizeFSRS}
                onReset={handleResetFSRS}
              />
            )}

            {activeTab === 'sync' && (
              <WebDAVSyncSettings />
            )}

            {activeTab === 'data' && (
              <DataSettings
                onResetDB={handleResetDB}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
