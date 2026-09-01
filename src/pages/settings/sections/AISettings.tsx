import { useState } from "react";
import { Eye, EyeOff, Cpu, Layers, KeyRound } from "lucide-react";
import { LLMTask, TaskAIConfig } from "../../../services/llm";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";

interface AISettingsProps {
  provider: 'gemini' | 'groq' | 'local';
  setProvider: (p: 'gemini' | 'groq' | 'local') => void;
  geminiKey: string;
  setGeminiKey: (k: string) => void;
  geminiModel: string;
  setGeminiModel: (m: string) => void;
  groqKey: string;
  setGroqKey: (k: string) => void;
  groqModel: string;
  setGroqModel: (m: string) => void;
  localUrl: string;
  setLocalUrl: (u: string) => void;
  localModel: string;
  setLocalModel: (m: string) => void;
  taskSettings: Record<LLMTask, TaskAIConfig>;
  onTaskSettingChange: (task: LLMTask, field: keyof TaskAIConfig, value: string) => void;
}

const TASKS: { id: LLMTask; label: string; desc: string }[] = [
  { id: 'scan', label: 'Flashcard Generation', desc: 'Text & image-based flashcard extraction.' },
  { id: 'validate', label: 'Answer Validation', desc: 'Fast evaluation and scoring of student answers.' },
  { id: 'teach', label: 'Teach Mode Tutor', desc: 'Interactive tutor dialogue and conversational personas.' },
  { id: 'quiz', label: 'Quiz Generation', desc: 'Multiple-choice and short-answer quiz creation.' },
  { id: 'test', label: 'Test Scanning & Auto-Fill', desc: 'Full test OCR, extraction, grading, and auto-filling.' }
];

export default function AISettings({
  provider,
  setProvider,
  geminiKey,
  setGeminiKey,
  geminiModel,
  setGeminiModel,
  groqKey,
  setGroqKey,
  groqModel,
  setGroqModel,
  localUrl,
  setLocalUrl,
  localModel,
  setLocalModel,
  taskSettings,
  onTaskSettingChange
}: AISettingsProps) {
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);

  return (
    <div className="settings-section-container">
      {/* Provider Selector Card */}
      <SettingCard
        title="Primary AI Provider"
        icon={<Cpu size={20} />}
      >
        <SettingRow
          label="Default Provider"
        >
          <select
            className="notion-input"
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
            style={{ width: "240px" }}
          >
            <option value="gemini">Google Gemini API</option>
            <option value="groq">Groq API (Ultra-Fast Llama)</option>
            <option value="local">Local LLM (LM Studio / Ollama)</option>
          </select>
        </SettingRow>
      </SettingCard>

      {/* Provider Credentials Card */}
      {provider === 'gemini' && (
        <SettingCard
          title="Google Gemini Credentials"
          icon={<KeyRound size={20} />}
        >
          <SettingRow
            label="API Key"
            vertical
          >
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <input
                className="notion-input"
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Enter your AIzaSy... API key"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                title={showGeminiKey ? "Hide key" : "Show key"}
              >
                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label="Model Identifier"
            vertical
          >
            <input
              className="notion-input"
              type="text"
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              placeholder="gemini-3.1-flash-lite"
            />
          </SettingRow>
        </SettingCard>
      )}

      {provider === 'groq' && (
        <SettingCard
          title="Groq API Credentials"
          icon={<KeyRound size={20} />}
        >
          <SettingRow
            label="API Key"
            vertical
          >
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <input
                className="notion-input"
                type={showGroqKey ? "text" : "password"}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="Enter your gsk_... API key"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={() => setShowGroqKey(!showGroqKey)}
                title={showGroqKey ? "Hide key" : "Show key"}
              >
                {showGroqKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label="Model Identifier"
            vertical
          >
            <input
              className="notion-input"
              type="text"
              value={groqModel}
              onChange={(e) => setGroqModel(e.target.value)}
              placeholder="llama-3.3-70b-versatile"
            />
          </SettingRow>
        </SettingCard>
      )}

      {provider === 'local' && (
        <SettingCard
          title="Local LLM Server"
          description="Connect to an OpenAI-compatible local endpoint like LM Studio or Ollama."
          icon={<KeyRound size={20} />}
        >
          <SettingRow
            label="Server Endpoint URL"
            description="LM Studio defaults to http://localhost:1234/v1. Ollama OpenAI endpoint runs on http://localhost:11434/v1."
            vertical
          >
            <input
              className="notion-input"
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://localhost:1234/v1"
            />
          </SettingRow>

          <SettingRow
            label="Model Identifier"
            description="Loaded model name or tag from your local server."
            vertical
          >
            <input
              className="notion-input"
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="e.g. lmstudio-model"
            />
          </SettingRow>
        </SettingCard>
      )}

      {/* Task-Specific AI Routing */}
      <SettingCard
        title="Task-Specific AI Routing"
        description="Assign dedicated AI providers or models to specific tasks (e.g. fast models for validation, deep models for test analysis)."
        icon={<Layers size={20} />}
      >
        <div className="task-routing-grid">
          {TASKS.map(task => (
            <div key={task.id} className="task-routing-card">
              <div className="task-routing-header">
                <span className="task-routing-title">{task.label}</span>
                <span className="task-routing-desc">{task.desc}</span>
              </div>

              <div className="task-routing-controls">
                <div className="notion-input-group">
                  <label style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Provider</label>
                  <select
                    className="notion-input"
                    value={taskSettings[task.id]?.provider || 'global'}
                    onChange={(e) => onTaskSettingChange(task.id, 'provider', e.target.value)}
                    style={{ padding: "6px 10px", fontSize: "0.82rem" }}
                  >
                    <option value="global">Inherit Global Provider</option>
                    <option value="gemini">Google Gemini API</option>
                    <option value="groq">Groq API</option>
                    <option value="local">Local LLM</option>
                  </select>
                </div>

                <div className="notion-input-group">
                  <label style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Model Override</label>
                  <input
                    className="notion-input"
                    type="text"
                    disabled={taskSettings[task.id]?.provider === 'global'}
                    value={taskSettings[task.id]?.model || ''}
                    onChange={(e) => onTaskSettingChange(task.id, 'model', e.target.value)}
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
      </SettingCard>
    </div>
  );
}
