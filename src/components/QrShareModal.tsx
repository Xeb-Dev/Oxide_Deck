import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, X, ChevronLeft, ChevronRight, Play, Pause, Layers, Maximize2, Minimize2 } from "lucide-react";
import { encryptPackagePayload, ChunkedQrResult } from "../services/p2pCrypto";
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
  const [qrResult, setQrResult] = useState<ChunkedQrResult | null>(null);
  const [activeChunk, setActiveChunk] = useState<number>(0);
  const [autoPlay, setAutoPlay] = useState<boolean>(true);
  const [isEnlarged, setIsEnlarged] = useState<boolean>(false);

  // 1. Generate Encrypted Chunked QR codes
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

        const result = await encryptPackagePayload(
          payloadData,
          itemType,
          itemName,
          itemIcon
        );

        if (!mounted) return;

        setQrResult(result);
        setActiveChunk(0);
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

  // 2. Auto-cycle multi-part QR codes
  useEffect(() => {
    if (!qrResult || qrResult.totalChunks <= 1 || !autoPlay) return;

    const interval = setInterval(() => {
      setActiveChunk((prev) => (prev + 1) % qrResult.totalChunks);
    }, 2800);

    return () => clearInterval(interval);
  }, [qrResult, autoPlay]);

  // 3. Render current active QR chunk to Canvas (scales dynamically with Enlarge mode)
  useEffect(() => {
    if (!qrResult || !canvasRef.current) return;

    const currentQrString = qrResult.qrStrings[activeChunk];
    if (!currentQrString) return;

    const canvasWidth = isEnlarged ? 400 : 300;

    QRCode.toCanvas(canvasRef.current, currentQrString, {
      width: canvasWidth,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "L", // Low redundancy maximizes data density and chunky pixel size
    }).catch((err) => {
      console.warn("QR Render Error:", err);
    });
  }, [qrResult, activeChunk, isEnlarged]);

  const totalChunks = qrResult?.totalChunks || 1;
  const isMultiPart = totalChunks > 1;

  const handlePrev = () => {
    setAutoPlay(false);
    setActiveChunk((prev) => (prev - 1 + totalChunks) % totalChunks);
  };

  const handleNext = () => {
    setAutoPlay(false);
    setActiveChunk((prev) => (prev + 1) % totalChunks);
  };

  const handleSelectChunk = (index: number) => {
    setAutoPlay(false);
    setActiveChunk(index);
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
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          padding: isEnlarged ? "20px" : "24px",
          width: "100%",
          maxWidth: isEnlarged ? "520px" : "440px",
          boxShadow: "0 20px 48px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "14px",
          position: "relative",
          transition: "max-width 0.2s ease",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.6rem" }}>{itemIcon || "📦"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Share {itemType.charAt(0).toUpperCase() + itemType.slice(1)}
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {itemName}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              className="theme-toggle-btn"
              onClick={() => setIsEnlarged(!isEnlarged)}
              title={isEnlarged ? "Default Size" : "Enlarge QR Code"}
              aria-label={isEnlarged ? "Default Size" : "Enlarge QR Code"}
            >
              {isEnlarged ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button className="theme-toggle-btn" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Security & Multi-Part Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            backgroundColor: "var(--bg-secondary)",
            padding: "8px 12px",
            borderRadius: "10px",
            fontSize: "0.8rem",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--success-color)", fontWeight: 600 }}>
            <ShieldCheck size={16} />
            <span>100% Offline Optical Transfer</span>
          </div>
          {isMultiPart && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent-color)", fontWeight: 700 }}>
              <Layers size={14} />
              <span>Part {activeChunk + 1} of {totalChunks}</span>
            </div>
          )}
        </div>

        {/* QR Code Frame */}
        <div
          onClick={() => setIsEnlarged(!isEnlarged)}
          style={{
            position: "relative",
            width: isEnlarged ? "420px" : "320px",
            height: isEnlarged ? "420px" : "320px",
            maxWidth: "100%",
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            overflow: "hidden",
            cursor: "zoom-in",
            transition: "width 0.2s ease, height 0.2s ease",
          }}
          title="Click to toggle Enlarge"
        >
          {loading && (
            <div style={{ color: "#475569", fontSize: "0.9rem", fontWeight: 500 }}>
              Generating QR Code...
            </div>
          )}

          {error && (
            <div style={{ color: "var(--danger-color)", fontSize: "0.85rem", padding: "16px", textAlign: "center" }}>
              {error}
            </div>
          )}

          <canvas
            ref={canvasRef}
            style={{
              display: loading || error ? "none" : "block",
              borderRadius: "8px",
            }}
          />
        </div>

        {/* Multi-Part QR Controls */}
        {isMultiPart && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
              <button
                type="button"
                className="notion-btn secondary"
                onClick={handlePrev}
                style={{ padding: "6px 10px" }}
                title="Previous Part"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                type="button"
                className="notion-btn secondary"
                onClick={() => setAutoPlay(!autoPlay)}
                style={{ padding: "6px 12px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "5px" }}
              >
                {autoPlay ? <Pause size={14} /> : <Play size={14} />}
                {autoPlay ? "Auto-Cycling (2s)" : "Paused"}
              </button>

              <button
                type="button"
                className="notion-btn secondary"
                onClick={handleNext}
                style={{ padding: "6px 10px" }}
                title="Next Part"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Chunk indicator pills */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
              {Array.from({ length: totalChunks }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectChunk(idx)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "0.74rem",
                    fontWeight: activeChunk === idx ? 700 : 500,
                    backgroundColor: activeChunk === idx ? "var(--accent-color)" : "var(--bg-secondary)",
                    color: activeChunk === idx ? "#ffffff" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Part {idx + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer Instructions */}
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.4 }}>
          {isMultiPart
            ? "Point your camera at each part. The scanner will collect parts in any order and automatically import once complete!"
            : "Point your phone camera at this QR code to import instantly 100% offline."}
        </p>
      </div>
    </div>
  );
}
