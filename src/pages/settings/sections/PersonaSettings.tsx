import { Plus, Trash2, BrainCircuit, User } from "lucide-react";
import { LearningPersonality } from "../../../services/llm";
import SettingCard from "../components/SettingCard";

interface PersonaSettingsProps {
  personalities: LearningPersonality[];
  onAddPersonality: () => void;
  onRemovePersonality: (id: string) => void;
  onUpdatePersonality: (id: string, field: 'name' | 'description', value: string) => void;
}

export default function PersonaSettings({
  personalities,
  onAddPersonality,
  onRemovePersonality,
  onUpdatePersonality
}: PersonaSettingsProps) {
  return (
    <div className="settings-section-container">
      <SettingCard
        title="Custom Teaching Personas"
        icon={<BrainCircuit size={20} />}
        headerAction={
          <button type="button" className="notion-btn secondary" onClick={onAddPersonality}>
            <Plus size={16} /> Add Persona
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {personalities.map((persona, index) => (
            <div key={persona.id} className="persona-config-card">
              <div className="persona-config-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="persona-avatar-badge">
                    <User size={14} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    Persona #{index + 1}
                  </span>
                </div>
                <button
                  type="button"
                  className="theme-toggle-btn"
                  onClick={() => onRemovePersonality(persona.id)}
                  aria-label="Remove persona"
                  title="Delete persona"
                >
                  <Trash2 size={15} style={{ color: "var(--danger-color)" }} />
                </button>
              </div>

              <div className="notion-input-group">
                <label>Persona Name</label>
                <input
                  className="notion-input"
                  type="text"
                  value={persona.name}
                  onChange={(e) => onUpdatePersonality(persona.id, 'name', e.target.value)}
                  placeholder="e.g. Socratic Professor, 5-Year-Old Child, Patient Mentor"
                />
              </div>

              <div className="notion-input-group">
                <label>Teaching Instructions & Behavior</label>
                <textarea
                  className="notion-input"
                  rows={3}
                  value={persona.description}
                  onChange={(e) => onUpdatePersonality(persona.id, 'description', e.target.value)}
                  placeholder="Describe how this personality explains concepts, challenges student assumptions, and formats feedback..."
                />
              </div>
            </div>
          ))}

          {personalities.length === 0 && (
            <div className="settings-empty-state">
              <BrainCircuit size={32} style={{ color: "var(--text-muted)", marginBottom: "8px" }} />
              <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                No Custom Personas Yet
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", maxWidth: "400px", textAlign: "center" }}>
                Built-in default tutor personalities will be used. Click <strong>Add Persona</strong> above to create your own custom study partners.
              </div>
            </div>
          )}
        </div>
      </SettingCard>
    </div>
  );
}
