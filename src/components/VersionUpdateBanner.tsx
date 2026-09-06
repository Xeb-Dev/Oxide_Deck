import { useState, useEffect } from "react";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

interface UpdateEventDetail {
  message?: string;
  required_version?: string;
  update_required?: boolean;
}

export default function VersionUpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateEventDetail | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleUpdateRequired = (e: any) => {
      if (e?.detail?.update_required) {
        setUpdateInfo(e.detail);
        setDismissed(false);
      }
    };
    window.addEventListener("webdav-update-required", handleUpdateRequired);
    return () => {
      window.removeEventListener("webdav-update-required", handleUpdateRequired);
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  const handleOpenRelease = async () => {
    const url = "https://github.com/Xeb-Dev/oxide_deck/releases/latest";
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="version-update-banner" role="alert">
      <div className="version-update-banner-icon">
        <AlertTriangle size={20} />
      </div>
      <div className="version-update-banner-content">
        <div className="version-update-banner-title">
          App Update Required for Cloud Sync
        </div>
        <div className="version-update-banner-text">
          {updateInfo.message ||
            `A newer version of Oxide Deck (${updateInfo.required_version || "latest"}) is required to synchronize with the remote database. Cloud sync has been paused to protect your local data.`}
        </div>
      </div>
      <div className="version-update-banner-actions">
        <button
          type="button"
          onClick={handleOpenRelease}
          className="version-update-banner-btn"
          title="Download latest version"
        >
          <ExternalLink size={14} />
          <span>Update Now</span>
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="version-update-banner-close"
          aria-label="Dismiss banner"
          title="Dismiss banner"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
