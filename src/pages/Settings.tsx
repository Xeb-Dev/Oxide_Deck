import React, { useEffect, useState } from "react";
import { resetDatabase } from "../services/db";
import { getAIConfig, getLearningPersonalities, LearningPersonality, saveLearningPersonalities } from "../services/llm";
import { Eye, EyeOff, Save, Trash2, ShieldAlert, Plus } from "lucide-react";
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
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("oxide_deck_ai_provider", provider);
    localStorage.setItem("oxide_deck_gemini_key", geminiKey);
    localStorage.setItem("oxide_deck_gemini_model", geminiModel);
    localStorage.setItem("oxide_deck_groq_key", groqKey);
    localStorage.setItem("oxide_deck_groq_model", groqModel);
    localStorage.setItem("oxide_deck_local_url", localUrl);
    localStorage.setItem("oxide_deck_local_model", localModel);
    saveLearningPersonalities(personalities);

    setSaveStatus({ message: "Configuration saved successfully!", variant: "success" });
    setTimeout(() => setSaveStatus(null), 3000);
  };

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

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "600px" }}>
        
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

        <button type="submit" className="notion-btn" style={{ alignSelf: "flex-start" }}>
          <Save size={16} /> Save Configuration
        </button>

      </form>

      <div style={{ height: "24px" }} />
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
