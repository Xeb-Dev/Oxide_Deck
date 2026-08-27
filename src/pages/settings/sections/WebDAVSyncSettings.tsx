import { useState, useEffect } from "react";
import {
  Cloud,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  Lock,
  FolderSync,
  HelpCircle,
  Zap,
} from "lucide-react";
import SettingCard from "../components/SettingCard";
import SettingRow from "../components/SettingRow";
import {
  WebDavConfig,
  loadWebDavConfig,
  saveWebDavConfig,
  testWebDAVConnection,
} from "../../../services/webdavService";
import {
  performWebDAVSync,
  forceUploadToWebDAV,
  forceDownloadFromWebDAV,
  SyncResult,
} from "../../../services/syncEngine";

export default function WebDAVSyncSettings() {
  const [config, setConfig] = useState<WebDavConfig>(loadWebDavConfig());
  const [showPassword, setShowPassword] = useState(false);
  const [intervalInputText, setIntervalInputText] = useState<string>(
    String(config.syncIntervalValue ?? 5)
  );

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    setIntervalInputText(String(config.syncIntervalValue ?? 5));
  }, [config.syncIntervalValue]);

  const getIntervalRange = (unit: "disabled" | "seconds" | "minutes") => {
    if (unit === "seconds") return { min: 5, max: 3600 };
    return { min: 1, max: 720 };
  };

  const handleIntervalBlur = () => {
    const { min, max } = getIntervalRange(config.syncIntervalUnit);
    const digitsOnly = intervalInputText.replace(/\D/g, "");
    const rawNum = digitsOnly ? parseInt(digitsOnly, 10) : min;
    const clamped = Math.min(max, Math.max(min, rawNum));

    setIntervalInputText(String(clamped));
    updateConfig("syncIntervalValue", clamped);
  };

  const handleUnitSelect = (newUnit: "disabled" | "seconds" | "minutes") => {
    const { min, max } = getIntervalRange(newUnit);
    const digitsOnly = intervalInputText.replace(/\D/g, "");
    const rawNum = digitsOnly ? parseInt(digitsOnly, 10) : min;
    const clamped = Math.min(max, Math.max(min, rawNum));

    setIntervalInputText(String(clamped));
    setConfig((prev) => {
      const updated = {
        ...prev,
        syncIntervalUnit: newUnit,
        syncIntervalValue: clamped,
      };
      saveWebDavConfig(updated);
      return updated;
    });
  };

  const updateConfig = <K extends keyof WebDavConfig>(key: K, value: WebDavConfig[K]) => {
    setConfig((prev) => {
      const updated = { ...prev, [key]: value };
      saveWebDavConfig(updated);
      return updated;
    });
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await testWebDAVConnection(config);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || "Connection test failed.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await performWebDAVSync(config);
      setSyncResult(res);
      if (res.success) {
        setConfig((prev) => ({ ...prev, lastSyncedAt: res.timestamp }));
      }
    } catch (e: any) {
      setSyncResult({
        success: false,
        message: e?.message || "Sync failed.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleForceUpload = async () => {
    if (
      !window.confirm(
        "Are you sure you want to force upload? This will overwrite the remote WebDAV backup with your current local database."
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      const res = await forceUploadToWebDAV(config);
      setSyncResult(res);
      if (res.success) {
        setConfig((prev) => ({ ...prev, lastSyncedAt: res.timestamp }));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleForceDownload = async () => {
    if (
      !window.confirm(
        "Are you sure you want to force download? This will overwrite your local database with the snapshot stored on the WebDAV server."
      )
    ) {
      return;
    }
    setSyncing(true);
    try {
      const res = await forceDownloadFromWebDAV(config);
      setSyncResult(res);
      if (res.success) {
        setConfig((prev) => ({ ...prev, lastSyncedAt: res.timestamp }));
      }
    } finally {
      setSyncing(false);
    }
  };

  const [, setTick] = useState(0);

  // Live timer tick to refresh relative time ("Just now", "25s ago", etc.)
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Listen for background sync completion events
  useEffect(() => {
    const handleSyncCompleted = (e: any) => {
      if (e.detail?.timestamp) {
        setConfig((prev) => ({ ...prev, lastSyncedAt: e.detail.timestamp }));
      }
    };
    window.addEventListener("webdav-sync-completed", handleSyncCompleted);
    return () => window.removeEventListener("webdav-sync-completed", handleSyncCompleted);
  }, []);

  const formatLastSync = (isoStr: string | null) => {
    if (!isoStr) return "Never synced";
    try {
      const diffSec = Math.round((Date.now() - new Date(isoStr).getTime()) / 1000);
      if (diffSec < 5) return "Just now";
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return new Date(isoStr).toLocaleDateString();
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="settings-section-container">
      {/* 1. Main Connection Configuration Card */}
      <SettingCard
        title="WebDAV Cloud Storage"
        icon={<Cloud size={20} style={{ color: "var(--accent-color)" }} />}
      >
        <SettingRow label="Enable WebDAV Synchronization">
          <label className="notion-switch">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => updateConfig("enabled", e.target.checked)}
            />
            <span className="notion-slider round"></span>
          </label>
        </SettingRow>

        <SettingRow label="Server WebDAV Endpoint URL" vertical>
          <div style={{ display: "flex", gap: "8px", width: "100%" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="url"
                className="notion-input"
                placeholder="https://cloud.example.com/remote.php/dav/files/user/"
                value={config.serverUrl}
                onChange={(e) => updateConfig("serverUrl", e.target.value)}
                style={{ width: "100%", paddingLeft: "32px" }}
              />
              <Server
                size={14}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-secondary)",
                }}
              />
            </div>
          </div>
        </SettingRow>

        <SettingRow label="Account Username" vertical>
          <input
            type="text"
            className="notion-input"
            placeholder="e.g. username"
            value={config.username}
            onChange={(e) => updateConfig("username", e.target.value)}
            style={{ width: "100%" }}
          />
        </SettingRow>

        <SettingRow label="Password / App Token" vertical>
          <div style={{ position: "relative", width: "100%" }}>
            <input
              type={showPassword ? "text" : "password"}
              className="notion-input"
              placeholder="••••••••••••••••"
              value={config.password}
              onChange={(e) => updateConfig("password", e.target.value)}
              style={{ width: "100%", paddingLeft: "32px", paddingRight: "40px" }}
            />
            <Lock
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-secondary)",
              }}
            />
            <button
              type="button"
              className="notion-btn-ghost icon-only"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                color: "var(--text-secondary)",
              }}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </SettingRow>

        <SettingRow label="Remote Directory Path" vertical>
          <div style={{ position: "relative", width: "100%" }}>
            <input
              type="text"
              className="notion-input"
              placeholder="/OxideDeck"
              value={config.remotePath}
              onChange={(e) => updateConfig("remotePath", e.target.value)}
              style={{ width: "100%", paddingLeft: "32px" }}
            />
            <FolderSync
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-secondary)",
              }}
            />
          </div>
        </SettingRow>

        <div style={{ marginTop: "12px", display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="notion-btn secondary"
            onClick={handleTestConnection}
            disabled={testingConnection || !config.serverUrl || !config.username}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Zap size={14} />
            {testingConnection ? "Testing Connection..." : "Test Connection"}
          </button>

          {testResult && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: testResult.success ? "var(--success-color, #10b981)" : "var(--danger-color, #ef4444)",
              }}
            >
              {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </SettingCard>

      {/* 2. Manual Sync & Operations Card */}
      <SettingCard
        title="Sync Operations"
        icon={<RefreshCw size={20} />}
      >
        <SettingRow
          label="Bidirectional Smart Sync"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              {config.lastSyncedAt ? `Last: ${formatLastSync(config.lastSyncedAt)}` : "Never synced"}
            </span>
            <button
              type="button"
              className="notion-btn primary"
              onClick={handleSyncNow}
              disabled={syncing || !config.serverUrl || !config.username}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}
            >
              <RefreshCw size={15} className={syncing ? "spin-animation" : ""} />
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </SettingRow>

        {syncResult && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: syncResult.success
                ? "rgba(16, 185, 129, 0.08)"
                : "rgba(239, 68, 68, 0.08)",
              border: `1px solid ${
                syncResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
              }`,
              marginTop: "4px",
              marginBottom: "12px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              fontSize: "0.85rem",
            }}
          >
            {syncResult.success ? (
              <CheckCircle2 size={18} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
            ) : (
              <AlertCircle size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
            )}
            <div>
              <div style={{ fontWeight: 600, color: syncResult.success ? "#10b981" : "#ef4444" }}>
                {syncResult.success ? "Synchronization Completed" : "Synchronization Failed"}
              </div>
              <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                {syncResult.message}
              </div>
            </div>
          </div>
        )}

        <SettingRow label="Force Upload to Server">
          <button
            type="button"
            className="notion-btn secondary"
            onClick={handleForceUpload}
            disabled={syncing || !config.serverUrl || !config.username}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <UploadCloud size={15} /> Force Upload
          </button>
        </SettingRow>

        <SettingRow label="Force Download from Server">
          <button
            type="button"
            className="notion-btn secondary"
            onClick={handleForceDownload}
            disabled={syncing || !config.serverUrl || !config.username}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <DownloadCloud size={15} /> Force Download
          </button>
        </SettingRow>
      </SettingCard>

      {/* 3. Automation Preferences Card */}
      <SettingCard
        title="Sync Automation & Frequency"
        icon={<Zap size={20} />}
      >
        <SettingRow label="Auto-Sync on Application Launch">
          <label className="notion-switch">
            <input
              type="checkbox"
              checked={config.autoSyncOnLaunch}
              disabled={!config.enabled}
              onChange={(e) => updateConfig("autoSyncOnLaunch", e.target.checked)}
            />
            <span className="notion-slider round"></span>
          </label>
        </SettingRow>

        <SettingRow label="Auto-Sync on Creating Decks & Tests">
          <label className="notion-switch">
            <input
              type="checkbox"
              checked={config.autoSyncOnChange}
              disabled={!config.enabled}
              onChange={(e) => updateConfig("autoSyncOnChange", e.target.checked)}
            />
            <span className="notion-slider round"></span>
          </label>
        </SettingRow>

        <SettingRow label="Auto-Sync after Revision Sessions">
          <label className="notion-switch">
            <input
              type="checkbox"
              checked={config.autoSyncOnReview}
              disabled={!config.enabled}
              onChange={(e) => updateConfig("autoSyncOnReview", e.target.checked)}
            />
            <span className="notion-slider round"></span>
          </label>
        </SettingRow>

        <SettingRow label="Periodic Background Sync Interval" vertical>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", width: "100%", marginTop: "4px" }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="notion-input"
              style={{ width: "80px", padding: "6px 10px", textAlign: "center", fontWeight: 600 }}
              value={intervalInputText}
              disabled={!config.enabled || config.syncIntervalUnit === "disabled"}
              onChange={(e) => setIntervalInputText(e.target.value)}
              onBlur={handleIntervalBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleIntervalBlur();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />

            <div style={{ display: "flex", gap: "6px" }}>
              {(["disabled", "seconds", "minutes"] as const).map((unit) => {
                const isActive = (config.syncIntervalUnit || "disabled") === unit;
                const labelMap = {
                  disabled: "Disabled",
                  seconds: "Seconds",
                  minutes: "Minutes",
                };
                return (
                  <button
                    key={unit}
                    type="button"
                    disabled={!config.enabled}
                    onClick={() => handleUnitSelect(unit)}
                    className={`streak-day-pill ${isActive ? "streak-day-pill-active" : "streak-day-pill-rest"}`}
                    style={{
                      fontSize: "0.8rem",
                      padding: "6px 14px",
                      cursor: config.enabled ? "pointer" : "not-allowed",
                      opacity: config.enabled ? 1 : 0.6,
                    }}
                  >
                    {labelMap[unit]}
                  </button>
                );
              })}
            </div>
          </div>
        </SettingRow>
      </SettingCard>

      {/* 4. Privacy & Architecture Explainer */}
      <SettingCard
        title="Privacy & Architecture"
        icon={<HelpCircle size={20} />}
      >
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 8px 0" }}>
            🔒 <strong>Direct & Private:</strong> Oxide Deck connects directly to your WebDAV provider using HTTPS and Basic/App Token authentication. No telemetry, third-party relays, or intermediary cloud services are involved.
          </p>
          <p style={{ margin: 0 }}>
            🧠 <strong>FSRS Spaced Repetition Merging:</strong> Memory states are resolved by timestamp and repetition depth. Studying on your phone automatically updates next review schedules on your desktop without wiping local decks.
          </p>
        </div>
      </SettingCard>
    </div>
  );
}
