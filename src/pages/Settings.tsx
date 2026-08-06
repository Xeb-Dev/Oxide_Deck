import { useEffect, useState } from "react";
import { resetDatabase, getFSRSParameters, optimizeFSRSParameters, resetFSRSParameters, FsrsParametersInfo } from "../services/db";
import { getAIConfig, getLearningPersonalities, LearningPersonality, saveLearningPersonalities, LLMTask, TaskAIConfig, getTaskAIConfig, saveTaskAIConfig } from "../services/llm";
import { Eye, EyeOff, Trash2, ShieldAlert, Plus, Sparkles, RotateCcw, Loader2, Bell, Clock, Volume2, Moon, Send, Flame } from "lucide-react";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";
import { getNotificationSettings, saveNotificationSettings, requestNotificationPermission, triggerNotification, NotificationSettings, DAY_KEYS, DAY_LABELS } from "../services/notificationService";

export default function SettingsPage() {
  const [provider, setProvider] = useState<'gemini' | 'groq' | 'local'>('gemini');
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-flash-lite");
  const [groqKey, setGroqKey] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [localUrl, setLocalUrl] = useState("http://localhost:1234/v1");
  const [localModel, setLocalModel] = useState("lmstudio-model");

  // Show/Hide password keys
  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);
  const [personalities, setPersonalities] = useState<LearningPersonality[]>([]);

  const [saveStatus, setSaveStatus] = useState<{ message: string; variant: StatusVariant } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // FSRS parameters
  const [fsrsParams, setFsrsParams] = useState<FsrsParametersInfo | null>(null);
  const [fsrsBusy, setFsrsBusy] = useState(false);

  const [taskSettings, setTaskSettings] = useState<Record<LLMTask, TaskAIConfig>>({
    scan: { provider: 'global', model: '' },
    validate: { provider: 'global', model: '' },
    teach: { provider: 'global', model: '' },
    quiz: { provider: 'global', model: '' },
    test: { provider: 'global', model: '' },
  });

  const handleTaskSettingChange = (task: LLMTask, field: keyof TaskAIConfig, value: string) => {
    setTaskSettings(prev => ({
      ...prev,
      [task]: {
        ...prev[task],
        [field]: value
      }
    }));
  };

  // Notification Settings State
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings());

  const handleNotifChange = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
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

  const updatePersonality = (id: string, field: 'name' | 'description', value: string) => {
    setPersonalities(prev => prev.map(persona => persona.id === id ? { ...persona, [field]: value } : persona));
  };

  const addPersonality = () => {
    setPersonalities(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Persona ${prev.length + 1}`,
        description: "Describe how this personality learns and what kind of feedback they need."
      }
    ]);
  };

  const removePersonality = (id: string) => {
    setPersonalities(prev => prev.filter(persona => persona.id !== id));
  };

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

  return (
    <>
      <div>
        <span className="page-emoji">⚙️</span>
        <h1 className="page-title">Settings</h1>
        <p className="sub-description">
          Configure API credentials, model definitions, and database structures.
        </p>
      </div>

      <div className="divider" />

      {saveStatus && (
        <StatusBanner
          message={saveStatus.message}
          variant={saveStatus.variant}
          onDismiss={saveStatus.variant === "error" ? () => setSaveStatus(null) : undefined}
        />
      )}

      <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "600px" }}>
        
        {/* LLM Provider selection */}
        <div className="notion-input-group">
          <label>AI LLM Provider</label>
          <select 
            className="notion-input" 
            value={provider} 
            onChange={(e) => setProvider(e.target.value as any)}
          >
            <option value="gemini">Google Gemini API</option>
            <option value="groq">Groq API</option>
            <option value="local">Local LLM (LM Studio / Ollama)</option>
          </select>
        </div>

        {/* GEMINI GROUP */}
        {provider === 'gemini' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Google Gemini Settings</span>
            
            <div className="notion-input-group">
              <label>API Key</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  className="notion-input" 
                  type={showGemini ? "text" : "password"} 
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Enter your AIzaSy... key"
                />
                <button type="button" className="theme-toggle-btn" onClick={() => setShowGemini(!showGemini)}>
                  {showGemini ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                Keys are stored locally in your browser/app storage.
              </span>
            </div>

            <div className="notion-input-group">
              <label>Model Name</label>
              <input 
                className="notion-input" 
                type="text" 
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                placeholder="e.g. gemini-3.5-flash or gemini-3.1-flash-lite"
              />
            </div>
          </div>
        )}

        {/* GROQ GROUP */}
        {provider === 'groq' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Groq Settings</span>

            <div className="notion-input-group">
              <label>API Key</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  className="notion-input" 
                  type={showGroq ? "text" : "password"} 
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  placeholder="Enter your gsk_... key"
                />
                <button type="button" className="theme-toggle-btn" onClick={() => setShowGroq(!showGroq)}>
                  {showGroq ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="notion-input-group">
              <label>Model Name</label>
              <input 
                className="notion-input" 
                type="text" 
                value={groqModel}
                onChange={(e) => setGroqModel(e.target.value)}
                placeholder="e.g. llama-3.3-70b-versatile"
              />
            </div>
          </div>
        )}

        {/* LOCAL LLM GROUP */}
        {provider === 'local' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Local LLM Settings</span>

            <div className="notion-input-group">
              <label>Local Endpoint URL</label>
              <input 
                className="notion-input" 
                type="text" 
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="e.g. http://localhost:1234/v1"
              />
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                LM Studio runs on http://localhost:1234/v1. Ollama OpenAI endpoint runs on http://localhost:11434/v1.
              </span>
            </div>

            <div className="notion-input-group">
              <label>Model Name / Identifier</label>
              <input 
                className="notion-input" 
                type="text" 
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="Model ID from local server"
              />
            </div>
          </div>
        )}

        {/* TASK SPECIFIC ROUTING */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Task-Specific AI Routing</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              Assign different AI providers or models to specific features (e.g., use speed-optimized models for answer validation, and high-quality models for quiz generation).
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { id: 'scan' as const, label: 'Flashcard Generation', desc: 'Used for text and image-based flashcard scanning.' },
              { id: 'validate' as const, label: 'Answer Validation', desc: 'Used for evaluating and scoring student-typed answers.' },
              { id: 'teach' as const, label: 'Teach Mode Tutor', desc: 'Used for interactive dialogue and conversational learning personas.' },
              { id: 'quiz' as const, label: 'Quiz Generation', desc: 'Used for generating multiple-choice/short-answer quizzes.' },
              { id: 'test' as const, label: 'Test Reading & Scanning', desc: 'Used for scanning, extracting, grading, and auto-filling tests.' }
            ].map(task => (
              <div key={task.id} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "12px", backgroundColor: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{task.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "2px" }}>{task.desc}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="notion-input-group">
                    <label style={{ fontSize: "0.7rem" }}>AI Provider</label>
                    <select
                      className="notion-input"
                      value={taskSettings[task.id]?.provider || 'global'}
                      onChange={(e) => handleTaskSettingChange(task.id, 'provider', e.target.value as any)}
                      style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    >
                      <option value="global">Inherit Global Provider</option>
                      <option value="gemini">Google Gemini API</option>
                      <option value="groq">Groq API</option>
                      <option value="local">Local LLM</option>
                    </select>
                  </div>

                  <div className="notion-input-group">
                    <label style={{ fontSize: "0.7rem" }}>Model Name</label>
                    <input
                      className="notion-input"
                      type="text"
                      disabled={taskSettings[task.id]?.provider === 'global'}
                      value={taskSettings[task.id]?.model || ''}
                      onChange={(e) => handleTaskSettingChange(task.id, 'model', e.target.value)}
                      placeholder={
                        taskSettings[task.id]?.provider === 'global'
                          ? "Inheriting global model"
                          : taskSettings[task.id]?.provider === 'gemini'
                          ? "e.g. gemini-1.5-flash"
                          : taskSettings[task.id]?.provider === 'groq'
                          ? "e.g. llama-3.3-70b-versatile"
                          : "e.g. lmstudio-model"
                      }
                      style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px", border: "1px solid var(--border-color)", borderRadius: "8px", backgroundColor: "var(--bg-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>Teaching Personalities</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                Add extra AI personalities for the new teach mode. You can create as many as you want.
              </div>
            </div>
            <button type="button" className="notion-btn secondary" onClick={addPersonality}>
              <Plus size={16} /> Add Persona
            </button>
          </div>

          {personalities.map((persona, index) => (
            <div key={persona.id} style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "12px", backgroundColor: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>Persona {index + 1}</span>
                <button type="button" className="theme-toggle-btn" onClick={() => removePersonality(persona.id)} aria-label="Remove persona">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="notion-input-group">
                <label>Name</label>
                <input
                  className="notion-input"
                  type="text"
                  value={persona.name}
                  onChange={(e) => updatePersonality(persona.id, 'name', e.target.value)}
                  placeholder="e.g. Child"
                />
              </div>

              <div className="notion-input-group">
                <label>Description</label>
                <textarea
                  className="notion-input"
                  rows={3}
                  value={persona.description}
                  onChange={(e) => updatePersonality(persona.id, 'description', e.target.value)}
                  placeholder="How this personality thinks and what kind of feedback they need"
                />
              </div>
            </div>
          ))}

          {personalities.length === 0 && (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              No custom personas yet. The defaults will still be available until you add your own.
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "var(--success-color)", fontWeight: 500, padding: "8px 0" }}>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--success-color)" }} />
          Changes saved automatically
        </div>

      </form>

      <div style={{ height: "24px" }} />
      <div className="divider" />

      {/* Notifications & Study Reminders Settings */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "600px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="section-title" style={{ fontSize: "1.2rem", margin: 0 }}>
            <Bell size={18} /> Study Reminders & Notifications
          </h2>
          <button className="notion-btn secondary" onClick={handleTestNotif} type="button" style={{ fontSize: "0.82rem", gap: "6px" }}>
            <Send size={14} /> Send Test Alert
          </button>
        </div>

        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "18px",
            backgroundColor: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* Master Switch */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Enable Notifications</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Allow system popups and in-app alerts for scheduled reviews
              </div>
            </div>
            <label className="toggle-switch" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={notifSettings.masterEnabled}
                onChange={(e) => handleNotifChange("masterEnabled", e.target.checked)}
              />
            </label>
          </div>

          {notifSettings.masterEnabled && (
            <>
              <div style={{ height: "1px", backgroundColor: "var(--border-color)", margin: "4px 0" }} />

              {/* Daily Study Reminder */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Clock size={15} /> Daily Study Reminders
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Configure reminder times for each day of the week
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifSettings.dailyReminderEnabled}
                    onChange={(e) => handleNotifChange("dailyReminderEnabled", e.target.checked)}
                  />
                </div>

                {notifSettings.dailyReminderEnabled && (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "8px",
                    padding: "10px",
                    backgroundColor: "var(--bg-primary, rgba(0,0,0,0.03))",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)"
                  }}>
                    {DAY_KEYS.map((dayKey) => {
                      const dayLabel = DAY_LABELS[dayKey];
                      const schedule = notifSettings.weeklySchedule[dayKey] || { enabled: true, time: "20:30" };

                      return (
                        <div key={dayKey} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "6px", borderRadius: "4px", backgroundColor: schedule.enabled ? "var(--bg-secondary)" : "transparent" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={{ fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                              <input
                                type="checkbox"
                                checked={schedule.enabled}
                                onChange={(e) => {
                                  const updatedSchedule = {
                                    ...notifSettings.weeklySchedule,
                                    [dayKey]: { ...schedule, enabled: e.target.checked }
                                  };
                                  handleNotifChange("weeklySchedule", updatedSchedule);
                                }}
                              />
                              {dayLabel.full}
                            </label>
                          </div>
                          <input
                            type="time"
                            className="notion-input"
                            style={{ fontSize: "0.78rem", padding: "2px 4px", width: "100%" }}
                            value={schedule.time}
                            disabled={!schedule.enabled}
                            onChange={(e) => {
                              const updatedSchedule = {
                                ...notifSettings.weeklySchedule,
                                [dayKey]: { ...schedule, time: e.target.value }
                              };
                              handleNotifChange("weeklySchedule", updatedSchedule);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Streak Active / Rest Days Settings */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Flame size={15} style={{ color: "#f59e0b" }} /> Active Streak Days (Rest Days)
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Select required study days. Days turned OFF count as rest days and won't break your streak!
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                  {DAY_KEYS.map((dayKey) => {
                    const isRequired = notifSettings.streakActiveDays[dayKey] ?? true;
                    const dayInfo = DAY_LABELS[dayKey];

                    return (
                      <button
                        key={dayKey}
                        type="button"
                        onClick={() => {
                          const updatedDays = {
                            ...notifSettings.streakActiveDays,
                            [dayKey]: !isRequired
                          };
                          handleNotifChange("streakActiveDays", updatedDays);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "20px",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: isRequired ? "1px solid var(--accent-color, #6366f1)" : "1px solid var(--border-color)",
                          backgroundColor: isRequired ? "var(--accent-color, #6366f1)" : "transparent",
                          color: isRequired ? "#ffffff" : "var(--text-secondary)",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {dayInfo.full.slice(0, 3)} {isRequired ? "✓" : "(Rest)"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Cards Threshold Alert */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Bell size={15} /> Due Cards Threshold Alert
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Notify when total due cards reach or exceed count
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="notion-input"
                    style={{ width: "70px", padding: "4px 8px" }}
                    value={notifSettings.dueCardsThresholdCount}
                    onChange={(e) => handleNotifChange("dueCardsThresholdCount", Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={!notifSettings.dueCardsThresholdEnabled}
                  />
                  <input
                    type="checkbox"
                    checked={notifSettings.dueCardsThresholdEnabled}
                    onChange={(e) => handleNotifChange("dueCardsThresholdEnabled", e.target.checked)}
                  />
                </div>
              </div>

              {/* Streak Saver Alert */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Flame size={15} style={{ color: "#f59e0b" }} /> Evening Streak Saver
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Warning alert if you haven't reviewed any cards today
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="time"
                    className="notion-input"
                    style={{ width: "120px", padding: "4px 8px" }}
                    value={notifSettings.streakSaverTime}
                    onChange={(e) => handleNotifChange("streakSaverTime", e.target.value)}
                    disabled={!notifSettings.streakSaverEnabled}
                  />
                  <input
                    type="checkbox"
                    checked={notifSettings.streakSaverEnabled}
                    onChange={(e) => handleNotifChange("streakSaverEnabled", e.target.checked)}
                  />
                </div>
              </div>

              {/* Quiet Hours (DND) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Moon size={15} /> Quiet Hours (Do Not Disturb)
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Silence non-critical OS popups between times
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="time"
                    className="notion-input"
                    style={{ width: "110px", padding: "4px 6px" }}
                    value={notifSettings.quietHoursStart}
                    onChange={(e) => handleNotifChange("quietHoursStart", e.target.value)}
                    disabled={!notifSettings.quietHoursEnabled}
                  />
                  <span style={{ fontSize: "0.8rem" }}>to</span>
                  <input
                    type="time"
                    className="notion-input"
                    style={{ width: "110px", padding: "4px 6px" }}
                    value={notifSettings.quietHoursEnd}
                    onChange={(e) => handleNotifChange("quietHoursEnd", e.target.value)}
                    disabled={!notifSettings.quietHoursEnabled}
                  />
                  <input
                    type="checkbox"
                    checked={notifSettings.quietHoursEnabled}
                    onChange={(e) => handleNotifChange("quietHoursEnabled", e.target.checked)}
                  />
                </div>
              </div>

              {/* Sound & In-App Toggles */}
              <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={notifSettings.soundEnabled}
                    onChange={(e) => handleNotifChange("soundEnabled", e.target.checked)}
                  />
                  <Volume2 size={15} /> Sound Effects
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={notifSettings.inAppToastEnabled}
                    onChange={(e) => handleNotifChange("inAppToastEnabled", e.target.checked)}
                  />
                  <Bell size={15} /> In-App Banners
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ height: "24px" }} />
      <div className="divider" />

      {/* FSRS Parameters */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "600px" }}>
        <h2 className="section-title" style={{ fontSize: "1.2rem" }}>
          <Sparkles size={18} /> FSRS Spaced Repetition
        </h2>
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Scheduler Parameters</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              The revision system uses the FSRS algorithm (via <code>ts-fsrs</code>). Parameters can be optimized from your review history.
            </div>
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Status:{" "}
            {fsrsParams ? (
              <>
                <strong style={{ color: "var(--text-primary)" }}>
                  {fsrsParams.isDefault ? "Default parameters" : "Custom parameters"}
                </strong>
                {" · "}
                {fsrsParams.reviewCount} rated review{fsrsParams.reviewCount === 1 ? "" : "s"}
                {fsrsParams.updatedAt && (
                  <> · last updated {new Date(fsrsParams.updatedAt).toLocaleString()}</>
                )}
              </>
            ) : (
              "Loading…"
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className="notion-btn secondary" onClick={handleOptimizeFSRS} disabled={fsrsBusy}>
              {fsrsBusy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={16} />}
              Optimize Parameters
            </button>
            <button className="notion-btn secondary" onClick={handleResetFSRS} disabled={fsrsBusy}>
              <RotateCcw size={16} /> Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Danger Zone */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "600px" }}>
        <h2 className="section-title" style={{ fontSize: "1.2rem", color: "var(--danger-color)" }}>
          <ShieldAlert size={18} /> Danger Zone
        </h2>
        
        <div 
          style={{ 
            border: "1px solid var(--danger-color)", 
            borderRadius: "8px", 
            padding: "16px", 
            backgroundColor: "var(--danger-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px"
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Reset Application Database</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              Permanently wipe all deck schemas, revision logs, and user metadata.
            </div>
          </div>
          <button className="notion-btn danger" onClick={handleResetDB}>
            <Trash2 size={16} /> Reset DB
          </button>
        </div>
      </div>
    </>
  );
}
