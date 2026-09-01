import { useState, useEffect } from "react";
import {
  ShieldAlert,
  Trash2,
  Database,
  FileText,
  Download,
  RefreshCw,
  CheckCircle2,
  Eye,
  Copy,
  Check,
  X,
} from "lucide-react";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";
import {
  getLogsSummary,
  saveDebugLogsToFile,
  getDebugLogsContent,
  clearDebugLogs,
  LogsSummary,
  logger,
} from "../../../services/logger";

interface DataSettingsProps {
  onResetDB: () => void;
  onNotify?: (message: string, variant: "success" | "error") => void;
}

export default function DataSettings({ onResetDB, onNotify }: DataSettingsProps) {
  const [logsSummary, setLogsSummary] = useState<LogsSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // View modal state
  const [showLogModal, setShowLogModal] = useState(false);
  const [logModalContent, setLogModalContent] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const loadSummary = async () => {
    try {
      const summary = await getLogsSummary();
      setLogsSummary(summary);
    } catch (e) {
      console.error("Failed to load logs summary:", e);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleSaveToFile = async () => {
    try {
      setIsExporting(true);
      const savedPath = await saveDebugLogsToFile();
      logger.info("Diagnostics", "Saved diagnostic logs to file", { path: savedPath });
      await loadSummary();
      if (onNotify) {
        onNotify(`Logs saved to: ${savedPath}`, "success");
      }
    } catch (e: any) {
      logger.error("Diagnostics", "Failed to save logs to file", e);
      if (onNotify) {
        onNotify(`Failed to save logs: ${e?.message || e}`, "error");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenViewer = async () => {
    try {
      setIsExporting(true);
      const content = await getDebugLogsContent();
      setLogModalContent(content);
      setShowLogModal(true);
    } catch (e: any) {
      if (onNotify) {
        onNotify(`Failed to read logs: ${e?.message || e}`, "error");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logModalContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    if (onNotify) {
      onNotify("Logs copied to clipboard.", "success");
    }
  };

  const handleClear = async () => {
    if (confirm("Are you sure you want to clear all diagnostic debug logs?")) {
      try {
        setIsClearing(true);
        await clearDebugLogs();
        await loadSummary();
        if (onNotify) {
          onNotify("Diagnostic debug logs cleared.", "success");
        }
      } catch (e: any) {
        if (onNotify) {
          onNotify(`Failed to clear logs: ${e?.message || e}`, "error");
        }
      } finally {
        setIsClearing(false);
      }
    }
  };

  return (
    <div className="settings-section-container">
      {/* Storage Information Card */}
      <SettingCard
        title="Local Database & Storage"
        icon={<Database size={20} />}
      >
        <SettingRow
          label="Data Storage Engine"
        >
          <span className="settings-status-chip">Local SQLite</span>
        </SettingRow>
      </SettingCard>

      {/* Diagnostics & Logging Card */}
      <SettingCard
        title="System Diagnostics & Logs"
        icon={<FileText size={20} style={{ color: "var(--accent-color, #7C3AED)" }} />}
      >
        <SettingRow
          label="Log Retention & Size"
          description="Logs are split by day with a strict 50MB total storage cap. Oldest logs are automatically purged when the threshold is reached."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              className="settings-status-chip"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {logsSummary
                ? `${logsSummary.total_size_formatted} (${logsSummary.files_count} daily ${
                    logsSummary.files_count === 1 ? "file" : "files"
                  })`
                : "Calculating..."}
            </span>
            <button
              type="button"
              className="notion-btn ghost"
              style={{ padding: "4px 8px" }}
              title="Refresh log summary"
              onClick={loadSummary}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </SettingRow>

        <SettingRow
          label="Privacy Protection"
          description="Strictly sanitized. Passwords, authorization tokens, emails, and flashcard card bodies are completely excluded from logs."
        >
          <span
            className="settings-status-chip"
            style={{ color: "var(--success-color, #10B981)", borderColor: "rgba(16, 185, 129, 0.2)", gap: "4px" }}
          >
            <CheckCircle2 size={13} /> Sanitized
          </span>
        </SettingRow>

        <SettingRow
          label="Diagnostic Log Actions"
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="notion-btn"
              onClick={handleSaveToFile}
              disabled={isExporting}
              style={{ gap: "6px" }}
            >
              <Download size={16} />
              {isExporting ? "Saving..." : "Save to Downloads"}
            </button>

            <button
              type="button"
              className="notion-btn ghost"
              onClick={handleOpenViewer}
              disabled={isExporting}
              style={{ gap: "6px" }}
            >
              <Eye size={16} /> View & Copy Logs
            </button>

            <button
              type="button"
              className="notion-btn ghost"
              onClick={handleClear}
              disabled={isClearing || !logsSummary || logsSummary.files_count === 0}
              style={{ gap: "6px", color: "var(--danger-color, #EF4444)" }}
            >
              <Trash2 size={16} />
              {isClearing ? "Clearing..." : "Clear Logs"}
            </button>
          </div>
        </SettingRow>
      </SettingCard>

      {/* Danger Zone Card */}
      <SettingCard
        title="Danger Zone"
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

      {/* In-App Diagnostic Log Viewer Modal */}
      {showLogModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setShowLogModal(false)}
        >
          <div
            style={{
              backgroundColor: "var(--card-bg, #1a1a24)",
              border: "1px solid var(--border-color, rgba(255,255,255,0.1))",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "750px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.1))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileText size={20} style={{ color: "var(--accent-color, #7C3AED)" }} />
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Diagnostic Debug Logs</h3>
              </div>
              <button
                type="button"
                className="notion-btn ghost"
                style={{ padding: "6px" }}
                onClick={() => setShowLogModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Scrollable Log Content */}
            <div
              style={{
                flex: 1,
                padding: "16px 20px",
                overflowY: "auto",
                backgroundColor: "#0d0d12",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: "0.82rem",
                  fontFamily: "monospace",
                  lineHeight: "1.5",
                  color: "#d1d5db",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  userSelect: "text",
                }}
              >
                {logModalContent || "No logs recorded yet."}
              </pre>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderTop: "1px solid var(--border-color, rgba(255,255,255,0.1))",
                backgroundColor: "var(--card-bg, #1a1a24)",
              }}
            >
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary, #9CA3AF)" }}>
                Personal notes and auth tokens are scrubbed.
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="notion-btn"
                  onClick={handleCopyLogs}
                  style={{ gap: "6px" }}
                >
                  {isCopied ? <Check size={16} style={{ color: "#10B981" }} /> : <Copy size={16} />}
                  {isCopied ? "Copied!" : "Copy to Clipboard"}
                </button>
                <button
                  type="button"
                  className="notion-btn ghost"
                  onClick={() => setShowLogModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
