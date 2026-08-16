import { Sparkles, RotateCcw, Loader2, BarChart2 } from "lucide-react";
import { FsrsParametersInfo } from "../../../services/db";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";

interface FSRSSettingsProps {
  fsrsParams: FsrsParametersInfo | null;
  fsrsBusy: boolean;
  onOptimize: () => void;
  onReset: () => void;
}

export default function FSRSSettings({
  fsrsParams,
  fsrsBusy,
  onOptimize,
  onReset
}: FSRSSettingsProps) {
  return (
    <div className="settings-section-container">
      <SettingCard
        title="FSRS Spaced Repetition Scheduler"
        description="Free Spaced Repetition Scheduler (FSRS) is a modern, mathematically optimal memory model that predicts memory decay and schedules reviews."
        icon={<Sparkles size={20} />}
      >
        <div className="fsrs-status-box">
          <div className="fsrs-status-row">
            <span className="fsrs-status-label">Parameter Status:</span>
            <span className="fsrs-status-badge">
              {fsrsParams ? (
                fsrsParams.isDefault ? "Default Preset" : "Optimized (Customized)"
              ) : (
                "Loading…"
              )}
            </span>
          </div>

          <div className="fsrs-status-row">
            <span className="fsrs-status-label">Training Reviews Sampled:</span>
            <span className="fsrs-status-value">
              {fsrsParams ? `${fsrsParams.reviewCount} rated reviews` : "—"}
            </span>
          </div>

          {fsrsParams?.updatedAt && (
            <div className="fsrs-status-row">
              <span className="fsrs-status-label">Last Parameter Update:</span>
              <span className="fsrs-status-value">
                {new Date(fsrsParams.updatedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <SettingRow
          label="Parameter Optimization"
          description="Analyze your personal card review history to fine-tune weights for your individual memory retention curve."
          vertical
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
            <button
              type="button"
              className="notion-btn primary"
              onClick={onOptimize}
              disabled={fsrsBusy}
              style={{ gap: "6px" }}
            >
              {fsrsBusy ? (
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <BarChart2 size={16} />
              )}
              {fsrsBusy ? "Optimizing…" : "Optimize From History"}
            </button>

            <button
              type="button"
              className="notion-btn secondary"
              onClick={onReset}
              disabled={fsrsBusy}
              style={{ gap: "6px" }}
            >
              <RotateCcw size={16} />
              Reset to Defaults
            </button>
          </div>
        </SettingRow>
      </SettingCard>
    </div>
  );
}
