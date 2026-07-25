import { useEffect, useState } from "react";
import { resetDatabase, getFSRSParameters, optimizeFSRSParameters, resetFSRSParameters, FsrsParametersInfo } from "../services/db";
import { getAIConfig, getLearningPersonalities, LearningPersonality, saveLearningPersonalities, LLMTask, TaskAIConfig, getTaskAIConfig, saveTaskAIConfig } from "../services/llm";
import { Eye, EyeOff, Trash2, ShieldAlert, Plus, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import StatusBanner, { StatusVariant } from "../components/StatusBanner";

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

    setTaskSettings({
      scan: getTaskAIConfig('scan'),
      validate: getTaskAIConfig('validate'),
      teach: getTaskAIConfig('teach'),
      quiz: getTaskAIConfig('quiz'),
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

    saveTaskAIConfig('scan', taskSettings.scan);
    saveTaskAIConfig('validate', taskSettings.validate);
    saveTaskAIConfig('teach', taskSettings.teach);
    saveTaskAIConfig('quiz', taskSettings.quiz);
  }, [provider, geminiKey, geminiModel, groqKey, groqModel, localUrl, localModel, personalities, taskSettings, isLoaded]);

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
              { id: 'quiz' as const, label: 'Quiz Generation', desc: 'Used for generating multiple-choice/short-answer quizzes.' }
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
