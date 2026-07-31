import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, Clock, X } from "lucide-react";
import { encryptPackagePayload } from "../services/p2pCrypto";
import { getDeckPackagePayload, getFolderPackagePayload, getSubjectPackagePayload } from "../services/exportImport";

interface QrShareModalProps {
  itemType: "deck" | "folder" | "subject";
  itemId: string;
  itemName: string;
  itemIcon: string;
  onClose: () => void;
}

export default function QrShareModal({ itemType, itemId, itemName, itemIcon, onClose }: QrShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isP2p, setIsP2p] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function generateEncryptedQr() {
      try {
        setLoading(true);
        setError(null);

        let payloadData: any = null;
        if (itemType === "deck") {
          payloadData = await getDeckPackagePayload(itemId);
        } else if (itemType === "folder") {
          payloadData = await getFolderPackagePayload(itemId);
        } else if (itemType === "subject") {
          payloadData = await getSubjectPackagePayload(itemId);
        }

        const { qrString: generatedQr, isP2pStream } = await encryptPackagePayload(
          payloadData,
          itemType,
          itemName,
          itemIcon
        );

        if (!mounted) return;

        setIsP2p(isP2pStream);

        // Render to canvas
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, generatedQr, {
            width: 280,
            margin: 2,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
            errorCorrectionLevel: "M",
          });
        }
        setLoading(false);
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to generate QR code.");
          setLoading(false);
        }
      }
    }

    generateEncryptedQr();

    return () => {
      mounted = false;
    };
  }, [itemType, itemId, itemName, itemIcon]);

  // Session 60s Countdown Timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

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
          maxWidth: "420px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          position: "relative",
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.8rem" }}>{itemIcon || "📦"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Share {itemType.toUpperCase()}
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {itemName}
              </p>
            </div>
          </div>
          <button className="theme-toggle-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Security Badge */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "var(--success-light)",
              color: "var(--success-color)",
              padding: "8px 14px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              border: "1px solid rgba(59, 156, 102, 0.2)",
            }}
          >
            <ShieldCheck size={16} />
            <span>AES-256-GCM End-to-End Encrypted</span>
          </div>

          {isP2p && (
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--accent-color)",
                backgroundColor: "var(--accent-light)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontWeight: 600,
              }}
            >
              ⚡ High-Capacity P2P Handshake QR Code Ready
            </div>
          )}
        </div>

        {/* QR Code Display Canvas */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ffffff",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            minHeight: "290px",
            position: "relative",
          }}
        >
          {loading && (
            <div style={{ fontStyle: "italic", color: "#64748b", fontSize: "0.9rem" }}>
              Generating P2P encrypted QR code...
            </div>
          )}

          {error && (
            <div style={{ color: "var(--danger-color)", fontSize: "0.88rem", textAlign: "center" }}>
              {error}
            </div>
          )}

          <canvas
            ref={canvasRef}
            style={{
              display: loading || error ? "none" : "block",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          />

          {!loading && !error && timeLeft === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "12px",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <Clock size={32} color="var(--danger-color)" />
              <p style={{ fontWeight: 700, margin: "8px 0 4px 0", color: "#0f172a" }}>
                Session Expired
              </p>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>
                Close and reopen to generate a fresh 60s encryption session.
              </p>
            </div>
          )}
        </div>

        {/* Session Expiration Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <span>One-Time P2P Session</span>
            <span style={{ fontWeight: 600, color: timeLeft < 10 ? "var(--danger-color)" : "inherit" }}>
              {timeLeft}s remaining
            </span>
          </div>
          <div
            style={{
              height: "4px",
              width: "100%",
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "2px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(timeLeft / 60) * 100}%`,
                backgroundColor: timeLeft < 10 ? "var(--danger-color)" : "var(--accent-color)",
                transition: "width 1s linear",
              }}
            />
          </div>
        </div>

        {/* Close Button */}
        <button
          className="notion-btn"
          style={{ width: "100%", padding: "10px", fontWeight: 600 }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}
