import { useState } from "react";
import { Eye, EyeOff, Cpu, Layers, KeyRound, Sparkles, X } from "lucide-react";
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

const TASKS: { id: LLMTask; label: string; desc: string; promptPlaceholder: string }[] = [
  {
    id: 'scan',
    label: 'Flashcard Generation',
    desc: 'Text & image-based flashcard extraction.',
    promptPlaceholder: 'e.g. Focus on definitions, keep explanations concise, include clinical correlations...',
  },
  {
    id: 'validate',
    label: 'Answer Validation',
    desc: 'Fast evaluation and scoring of student answers.',
    promptPlaceholder: 'e.g. Be lenient with minor typos, prioritize conceptual accuracy, demand exact terminology...',
  },
  {
    id: 'teach',
    label: 'Teach Mode Tutor',
    desc: 'Interactive tutor dialogue and conversational personas.',
    promptPlaceholder: 'e.g. Always respond with Socratic questions, use real-world analogies, challenge the student...',
  },
  {
    id: 'quiz',
    label: 'Quiz Generation',
    desc: 'Multiple-choice and short-answer quiz creation.',
    promptPlaceholder: 'e.g. Include challenging distractor options, focus on high-yield exam concepts...',
  },
  {
    id: 'test',
    label: 'Test Scanning & Auto-Fill',
    desc: 'Full test OCR, extraction, grading, and auto-filling.',
    promptPlaceholder: 'e.g. Preserve exact point values, format math formulas in LaTeX, provide step-by-step rationales...',
  },
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
        description="Assign dedicated AI providers, models, and custom prompt additions to specific tasks."
        icon={<Layers size={20} />}
      >
        <div className="task-routing-grid">
          {TASKS.map(task => {
            const hasCustomPrompt = Boolean(taskSettings[task.id]?.promptAddition?.trim());

            return (
              <div key={task.id} className="task-routing-card">
                <div className="task-routing-header">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <span className="task-routing-title">{task.label}</span>
                    {hasCustomPrompt && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          backgroundColor: "var(--accent-light)",
                          color: "var(--accent-color)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Sparkles size={11} /> Prompt Addition Active
                      </span>
                    )}
                  </div>
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

                <div className="task-routing-prompt-section" style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                      <Sparkles size={12} style={{ color: "var(--accent-color)" }} /> Custom Prompt Addition
                    </label>
                    {hasCustomPrompt && (
                      <button
                        type="button"
                        className="theme-toggle-btn"
                        style={{
                          padding: "2px 6px",
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          height: "auto",
                        }}
                        onClick={() => onTaskSettingChange(task.id, 'promptAddition', '')}
                        title="Clear custom prompt addition"
                      >
                        <X size={11} /> Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    className="notion-input"
                    rows={2}
                    value={taskSettings[task.id]?.promptAddition || ''}
                    onChange={(e) => onTaskSettingChange(task.id, 'promptAddition', e.target.value)}
                    placeholder={task.promptPlaceholder}
                    style={{
                      padding: "8px 10px",
                      fontSize: "0.82rem",
                      resize: "vertical",
                      minHeight: "52px",
                      lineHeight: "1.4",
                      fontFamily: "inherit",
                      borderRadius: "6px",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SettingCard>
    </div>
  );
}
