import { ShieldAlert, Trash2, Database } from "lucide-react";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";

interface DataSettingsProps {
  onResetDB: () => void;
}

export default function DataSettings({ onResetDB }: DataSettingsProps) {
  return (
    <div className="settings-section-container">
      {/* Storage Information Card */}
      <SettingCard
        title="Local Database & Storage"
        description="All decks, flashcards, tags, review logs, and tests are stored in a high-performance local SQLite database on your device."
        icon={<Database size={20} />}
      >
        <SettingRow
          label="Data Storage Engine"
          description="Local-first offline SQLite database via Tauri SQL plugin."
        >
          <span className="settings-status-chip">Local SQLite</span>
        </SettingRow>
      </SettingCard>

      {/* Danger Zone Card */}
      <SettingCard
        title="Danger Zone"
        description="Irreversible actions that modify or purge local application databases."
        icon={<ShieldAlert size={20} style={{ color: "var(--danger-color)" }} />}
        danger
      >
        <SettingRow
          label="Reset Entire Database"
          description="Permanently deletes all folders, decks, cards, review history, mock exam logs, and configuration. This action cannot be undone."
        >
          <button
            type="button"
            className="notion-btn danger"
            onClick={onResetDB}
            style={{ gap: "6px" }}
          >
            <Trash2 size={16} /> Reset Database
          </button>
        </SettingRow>
      </SettingCard>
    </div>
  );
}
