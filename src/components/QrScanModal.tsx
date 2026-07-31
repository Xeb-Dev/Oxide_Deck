import React, { useState } from "react";
import { QrCode, Upload, ArrowRight, CheckCircle2, AlertCircle, X } from "lucide-react";
import { decryptPackagePayload } from "../services/p2pCrypto";
import { importOxidePackage } from "../services/exportImport";

interface QrScanModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function QrScanModal({ onClose, onSuccess }: QrScanModalProps) {
  const [qrToken, setQrToken] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decryptedData, setDecryptedData] = useState<any | null>(null);
  const [itemType, setItemType] = useState<string>("");
  const [itemName, setItemName] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const handleDecryptToken = async (tokenStr: string) => {
    if (!tokenStr.trim()) return;
    try {
      setDecrypting(true);
      setError(null);
      setDecryptedData(null);

      const { data, itemType: typeVal, itemName: nameVal } = await decryptPackagePayload(tokenStr);

      setDecryptedData(data);
      setItemType(typeVal);
      setItemName(nameVal || "Imported Package");
      setDecrypting(false);
    } catch (err: any) {
      setError(err.message || "Failed to decrypt QR code payload.");
      setDecrypting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read text from text/JSON or scan image
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setQrToken(content);
        handleDecryptToken(content);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!decryptedData) return;
    try {
      setImporting(true);
      setError(null);

      // Wrap payload in virtual File for importOxidePackage
      const jsonStr = JSON.stringify(decryptedData);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const virtualFile = new File([blob], `${itemName.replace(/[^a-z0-9]/gi, "_")}.json`, {
        type: "application/json",
      });

      const message = await importOxidePackage(virtualFile);
      setImporting(false);
      onSuccess(message);
      onClose();
    } catch (err: any) {
      setError(err.message || "Import failed.");
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          padding: "28px",
          width: "100%",
          maxWidth: "460px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          position: "relative",
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <QrCode size={24} color="var(--accent-color)" />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Import via Encrypted QR Code
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Paste OXSHARE code token or upload QR payload file
              </p>
            </div>
          </div>
          <button className="theme-toggle-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Input Form */}
        {!decryptedData && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Encrypted QR Code Payload / Token:
              </label>
              <textarea
                rows={4}
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder="Paste OXSHARE1:key:iv:ciphertext code string..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                className="notion-btn"
                style={{ flex: 1, padding: "8px 14px" }}
                onClick={() => handleDecryptToken(qrToken)}
                disabled={decrypting || !qrToken.trim()}
              >
                {decrypting ? "Decrypting..." : "Decrypt Payload"}
                <ArrowRight size={14} style={{ marginLeft: "6px" }} />
              </button>

              <label
                className="notion-btn"
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Upload size={14} />
                <span>Upload File</span>
                <input type="file" accept=".png,.jpg,.jpeg,.json,.txt,.oxshare" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
            </div>
          </div>
        )}

        {/* Decrypted Item Preview */}
        {decryptedData && (
          <div
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--accent-color)",
              borderRadius: "12px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success-color)", fontSize: "0.82rem", fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>AES-256 Decryption Successful</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0" }}>
              <span style={{ fontSize: "2rem" }}>
                {decryptedData.deck?.icon || decryptedData.subject?.icon || decryptedData.folders?.[0]?.icon || "📦"}
              </span>
              <div>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>{itemName}</h4>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                  Type: {itemType} · Contains {decryptedData.flashcards?.length || 0} card(s)
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="notion-btn"
                style={{ flex: 1, backgroundColor: "var(--accent-color)", color: "#ffffff" }}
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing ? "Importing to DB..." : `Import ${itemType.toUpperCase()} Now`}
              </button>
              <button
                className="notion-btn"
                style={{ backgroundColor: "var(--bg-primary)" }}
                onClick={() => setDecryptedData(null)}
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--danger-color)",
              backgroundColor: "var(--danger-light)",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              border: "1px solid rgba(255,92,92,0.2)",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
