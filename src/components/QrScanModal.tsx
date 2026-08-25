import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  Upload,
  Clipboard,
  AlertCircle,
  X,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  SwitchCamera,
  FileText,
  Layers,
  Focus,
  Zap
} from "lucide-react";
import jsQR from "jsqr";
import {
  parseScannedQrString,
  assembleAndDecryptPackage,
  decryptPackagePayload,
  ScannedChunk
} from "../services/p2pCrypto";
import { importOxidePackage } from "../services/exportImport";

interface QrScanModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

type ScanMode = "camera" | "image" | "manual";

export default function QrScanModal({ onClose, onSuccess }: QrScanModalProps) {
  const [scanMode, setScanMode] = useState<ScanMode>("camera");
  const [qrToken, setQrToken] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [decryptedData, setDecryptedData] = useState<any | null>(null);
  const [itemType, setItemType] = useState<string>("");
  const [itemName, setItemName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Focus & Torch & Zoom state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isFocusing, setIsFocusing] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const zoomLevelRef = useRef<number>(1);

  // Multi-part QR tracking state
  const [collectedCount, setCollectedCount] = useState<number>(0);
  const [totalChunksCount, setTotalChunksCount] = useState<number>(1);
  const [collectedIndices, setCollectedIndices] = useState<number[]>([]);

  const chunksMapRef = useRef<Map<number, string>>(new Map());
  const headerRef = useRef<ScannedChunk | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Process a chunk string from camera or file
  const processQrChunk = useCallback(async (rawString: string) => {
    if (!rawString.trim() || isProcessingRef.current) return;

    try {
      setError(null);
      const chunk = parseScannedQrString(rawString);

      // If new session detected, reset chunk memory
      if (!headerRef.current || headerRef.current.sessionHash !== chunk.sessionHash) {
        headerRef.current = chunk;
        chunksMapRef.current = new Map();
      }

      // Add chunk if not already collected
      if (!chunksMapRef.current.has(chunk.chunkIndex)) {
        chunksMapRef.current.set(chunk.chunkIndex, chunk.chunkData);
        setCollectedCount(chunksMapRef.current.size);
        setTotalChunksCount(chunk.totalChunks);
        setCollectedIndices(Array.from(chunksMapRef.current.keys()));

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(60);
          } catch {}
        }
      }

      // Check if all chunks have been collected (in any order!)
      if (chunksMapRef.current.size === chunk.totalChunks) {
        isProcessingRef.current = true;
        stopCamera();
        setDecrypting(true);

        const { data, itemType: typeVal, itemName: nameVal } = await assembleAndDecryptPackage(
          chunksMapRef.current,
          headerRef.current
        );

        setDecryptedData(data);
        setItemType(typeVal);
        setItemName(nameVal || "Imported Package");

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate([60, 40, 100]);
          } catch {}
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to process QR code payload.");
    } finally {
      setDecrypting(false);
      isProcessingRef.current = false;
    }
  }, [stopCamera]);

  const lastScanTimeRef = useRef<number>(0);

  const scanFrame = useCallback(() => {
    if (!isScanningRef.current || isProcessingRef.current) return;

    const now = Date.now();
    // Throttle scanning to once every 100ms (10 scans/sec) to keep mobile CPU usage at < 2%
    if (now - lastScanTimeRef.current < 100) {
      if (isScanningRef.current && !isProcessingRef.current) {
        animFrameIdRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }
    lastScanTimeRef.current = now;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;

          const currentZoom = zoomLevelRef.current || 1;
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          // 1. High-fidelity Center Viewfinder Crop with Zoom scaling (crisp, zero-blur module sampling)
          const cropSize = Math.min(vw, vh) / currentZoom;
          const cropX = (vw - cropSize) / 2;
          const cropY = (vh - cropSize) / 2;

          const scanDim = Math.min(500, Math.floor(cropSize));
          canvas.width = scanDim;
          canvas.height = scanDim;

          ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, scanDim, scanDim);

          const imageData = ctx.getImageData(0, 0, scanDim, scanDim);
          let code = jsQR(imageData.data, scanDim, scanDim, {
            inversionAttempts: "attemptBoth",
          });

          // 2. Full Frame fallback
          if (!code) {
            const fullWidth = 480;
            const fullHeight = Math.floor(vh * (fullWidth / vw));
            canvas.width = fullWidth;
            canvas.height = fullHeight;
            ctx.drawImage(video, 0, 0, fullWidth, fullHeight);
            const fullImgData = ctx.getImageData(0, 0, fullWidth, fullHeight);
            code = jsQR(fullImgData.data, fullWidth, fullHeight, {
              inversionAttempts: "attemptBoth",
            });
          }

          if (code && code.data && !isProcessingRef.current) {
            processQrChunk(code.data);
          }
        }
      } catch (err) {
        console.warn("Scan frame error:", err);
      }
    }

    if (isScanningRef.current && !isProcessingRef.current) {
      animFrameIdRef.current = requestAnimationFrame(scanFrame);
    }
  }, [processQrChunk]);

  const cameraSessionIdRef = useRef<number>(0);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    const sessionId = ++cameraSessionIdRef.current;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported on this device/browser.");
      return;
    }

    try {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoDevices.length > 1);
      } catch {}

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // If user closed or switched while waiting for camera permission, cleanup and abort
      if (cameraSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps: any = track.getCapabilities ? track.getCapabilities() : {};
          setHasTorch(Boolean(caps.torch));
        } catch {}
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");

        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          if (playErr.name === "AbortError" || playErr.message?.includes("interrupted")) {
            // Normal browser play interruption during React mount/render lifecycle, ignore safely
            return;
          }
          throw playErr;
        }

        isScanningRef.current = true;
        animFrameIdRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.includes("interrupted")) {
        // Ignore aborted requests during mount transitions
        return;
      }
      console.warn("Camera start failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please grant camera permissions or select an image.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera found on this device.");
      } else {
        setCameraError("Unable to access camera: " + (err.message || "Unknown error"));
      }
    }
  }, [facingMode, scanFrame, stopCamera]);

  const handleSetZoom = useCallback(async (newZoom: number) => {
    zoomLevelRef.current = newZoom;
    setZoomLevel(newZoom);

    const track = streamRef.current?.getVideoTracks()?.[0];
    if (track) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ zoom: newZoom }],
        });
      } catch {}
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(30);
      } catch {}
    }
  }, []);

  const triggerAutofocus = useCallback(async (clientX?: number, clientY?: number) => {
    setIsFocusing(true);

    if (viewfinderRef.current) {
      if (clientX !== undefined && clientY !== undefined) {
        const rect = viewfinderRef.current.getBoundingClientRect();
        setFocusPoint({ x: clientX - rect.left, y: clientY - rect.top });
      } else {
        const rect = viewfinderRef.current.getBoundingClientRect();
        setFocusPoint({ x: rect.width / 2, y: rect.height / 2 });
      }
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch {}
    }

    // In Android WebView, software applyConstraints is often ignored by vendor camera HALs.
    // Stopping and re-acquiring the media stream forces the Camera2 HAL to perform a complete physical AF sweep across the focal range.
    try {
      await startCamera();
    } catch (err) {
      console.warn("Focus sweep restart error:", err);
    }

    setTimeout(() => {
      setFocusPoint(null);
      setIsFocusing(false);
    }, 700);
  }, [startCamera]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (track) {
      try {
        const nextState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setIsTorchOn(nextState);
      } catch (err) {
        console.warn("Torch constraint warning:", err);
      }
    }
  }, [isTorchOn]);

  useEffect(() => {
    if (scanMode === "camera" && !decryptedData) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [scanMode, decryptedData, startCamera, stopCamera]);

  // Decode QR code from uploaded image
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            setError("Failed to create image processing canvas.");
            return;
          }
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });

          if (code && code.data) {
            processQrChunk(code.data);
          } else {
            setError("No QR code found in the selected image. Please ensure the QR is clear and well-lit.");
          }
        };
        img.onerror = () => {
          setError("Failed to load selected image file.");
        };
        img.src = evt.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        if (content) {
          processQrChunk(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleManualDecrypt = async () => {
    if (!qrToken.trim()) return;
    try {
      setDecrypting(true);
      setError(null);
      const { data, itemType: typeVal, itemName: nameVal } = await decryptPackagePayload(qrToken);
      setDecryptedData(data);
      setItemType(typeVal);
      setItemName(nameVal || "Imported Package");
    } catch (err: any) {
      setError(err.message || "Failed to decrypt manual payload.");
    } finally {
      setDecrypting(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQrToken(text);
        processQrChunk(text);
      }
    } catch {
      setError("Unable to read from clipboard. Please paste manually into the text field.");
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleConfirmImport = async () => {
    if (!decryptedData) return;
    try {
      setImporting(true);
      setError(null);

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

  const resetScanner = () => {
    chunksMapRef.current.clear();
    headerRef.current = null;
    setCollectedCount(0);
    setTotalChunksCount(1);
    setCollectedIndices([]);
    setDecryptedData(null);
    setQrToken("");
    setError(null);
    setCameraError(null);
    if (scanMode === "camera") {
      startCamera();
    }
  };

  const isMultiPart = totalChunksCount > 1;

  const missingIndices: number[] = [];
  if (isMultiPart) {
    for (let i = 1; i <= totalChunksCount; i++) {
      if (!collectedIndices.includes(i)) {
        missingIndices.push(i);
      }
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "16px",
          padding: "24px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 20px 48px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: "relative",
          animation: "modalFadeIn 0.2s ease-out",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "var(--accent-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-color)",
              }}
            >
              <Camera size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                Scan QR Code
              </h3>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Offline Optical Transfer · Scan parts in any order
              </p>
            </div>
          </div>
          <button className="theme-toggle-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Mode Selector Tabs (only when not in preview mode) */}
        {!decryptedData && (
          <div
            style={{
              display: "flex",
              backgroundColor: "var(--bg-secondary)",
              padding: "4px",
              borderRadius: "10px",
              gap: "4px",
              border: "1px solid var(--border-color)",
            }}
          >
            <button
              type="button"
              onClick={() => setScanMode("camera")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.82rem",
                fontWeight: scanMode === "camera" ? 700 : 500,
                backgroundColor: scanMode === "camera" ? "var(--bg-primary)" : "transparent",
                color: scanMode === "camera" ? "var(--accent-color)" : "var(--text-secondary)",
                boxShadow: scanMode === "camera" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Camera size={15} />
              Camera
            </button>

            <button
              type="button"
              onClick={() => setScanMode("image")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.82rem",
                fontWeight: scanMode === "image" ? 700 : 500,
                backgroundColor: scanMode === "image" ? "var(--bg-primary)" : "transparent",
                color: scanMode === "image" ? "var(--accent-color)" : "var(--text-secondary)",
                boxShadow: scanMode === "image" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Upload size={15} />
              QR Photo
            </button>

            <button
              type="button"
              onClick={() => setScanMode("manual")}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.82rem",
                fontWeight: scanMode === "manual" ? 700 : 500,
                backgroundColor: scanMode === "manual" ? "var(--bg-primary)" : "transparent",
                color: scanMode === "manual" ? "var(--accent-color)" : "var(--text-secondary)",
                boxShadow: scanMode === "manual" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <FileText size={15} />
              Manual
            </button>
          </div>
        )}

        {/* Decrypted Item Preview */}
        {decryptedData ? (
          <div
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1.5px solid var(--accent-color)",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              animation: "modalFadeIn 0.2s ease-out",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--success-color)",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={18} />
              <span>Decrypted & Verified Package</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "12px",
                backgroundColor: "var(--bg-primary)",
                borderRadius: "10px",
                border: "1px solid var(--border-color)",
              }}
            >
              <span style={{ fontSize: "2.4rem", lineHeight: 1 }}>
                {decryptedData.deck?.icon ||
                  decryptedData.subject?.icon ||
                  decryptedData.folders?.[0]?.icon ||
                  "📦"}
              </span>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>{itemName}</h4>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "2px", textTransform: "capitalize" }}>
                  Type: <strong>{itemType}</strong> · {decryptedData.flashcards?.length || 0} Flashcard(s)
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button
                type="button"
                className="notion-btn primary"
                style={{ flex: 1, padding: "10px 16px", fontSize: "0.92rem", fontWeight: 700 }}
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing ? "Importing to Database..." : `Import ${itemType.toUpperCase()} Now`}
              </button>
              <button
                type="button"
                className="notion-btn secondary"
                onClick={resetScanner}
                style={{ padding: "10px 16px", fontSize: "0.88rem" }}
              >
                Scan Another
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* TAB 1: LIVE CAMERA SCANNER */}
            {scanMode === "camera" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
                {cameraError ? (
                  <div
                    style={{
                      width: "100%",
                      padding: "24px 16px",
                      borderRadius: "12px",
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px dashed var(--border-color)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "12px",
                      textAlign: "center",
                    }}
                  >
                    <AlertCircle size={32} color="#e11d48" />
                    <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                      {cameraError}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                      <button
                        type="button"
                        className="notion-btn primary"
                        style={{ fontSize: "0.82rem", padding: "6px 14px" }}
                        onClick={() => startCamera()}
                      >
                        <RefreshCw size={14} /> Retry Camera
                      </button>
                      <button
                        type="button"
                        className="notion-btn secondary"
                        style={{ fontSize: "0.82rem", padding: "6px 14px" }}
                        onClick={() => setScanMode("image")}
                      >
                        <Upload size={14} /> Upload QR Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={viewfinderRef}
                    onClick={(e) => triggerAutofocus(e.clientX, e.clientY)}
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "1/1",
                      maxHeight: "280px",
                      borderRadius: "14px",
                      overflow: "hidden",
                      backgroundColor: "#000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 18px rgba(0,0,0,0.2)",
                      cursor: "crosshair",
                    }}
                  >
                    <video
                      ref={videoRef}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: "center center",
                        transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                      muted
                      playsInline
                    />

                    {/* Floating Zoom Selector Pills */}
                    <div
                      style={{
                        position: "absolute",
                        top: isMultiPart ? "46px" : "12px",
                        right: "12px",
                        backgroundColor: "rgba(15, 23, 42, 0.78)",
                        backdropFilter: "blur(6px)",
                        padding: "3px 4px",
                        borderRadius: "20px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "flex",
                        gap: "2px",
                        zIndex: 12,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[1, 1.5, 2, 3].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => handleSetZoom(lvl)}
                          style={{
                            padding: "2px 7px",
                            borderRadius: "14px",
                            border: "none",
                            fontSize: "0.72rem",
                            fontWeight: zoomLevel === lvl ? 700 : 500,
                            backgroundColor: zoomLevel === lvl ? "var(--accent-color)" : "transparent",
                            color: zoomLevel === lvl ? "#ffffff" : "rgba(255,255,255,0.75)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {lvl}x
                        </button>
                      ))}
                    </div>

                    {/* Animated Tap-to-Focus Reticle Ring */}
                    {focusPoint && (
                      <div
                        style={{
                          position: "absolute",
                          left: `${focusPoint.x}px`,
                          top: `${focusPoint.y}px`,
                          width: "56px",
                          height: "56px",
                          borderRadius: "50%",
                          border: "2px solid #fbbf24",
                          boxShadow: "0 0 10px rgba(251, 191, 36, 0.6)",
                          pointerEvents: "none",
                          animation: "focusRingPulse 1.1s ease-out forwards",
                          zIndex: 15,
                        }}
                      />
                    )}

                    {/* Viewfinder Target Frame Overlay */}
                    <div
                      style={{
                        position: "absolute",
                        top: "14%",
                        left: "14%",
                        right: "14%",
                        bottom: "14%",
                        border: "2px solid var(--accent-color)",
                        borderRadius: "16px",
                        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                        pointerEvents: "none",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {/* Animated Scanner Laser Bar */}
                      <div
                        style={{
                          width: "90%",
                          height: "2px",
                          backgroundColor: "var(--accent-color)",
                          boxShadow: "0 0 8px var(--accent-color)",
                          animation: "qrScanLaser 2s ease-in-out infinite",
                        }}
                      />
                    </div>

                    {/* Multi-Part Missing Parts Overlay with Overflow Protection */}
                    {isMultiPart && (
                      <div
                        style={{
                          position: "absolute",
                          top: "10px",
                          left: "10px",
                          right: "10px",
                          backgroundColor: "rgba(15, 23, 42, 0.88)",
                          backdropFilter: "blur(8px)",
                          padding: "7px 12px",
                          borderRadius: "10px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          color: "#fff",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          zIndex: 5,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                          <Layers size={14} color="var(--accent-color)" />
                          <span>Scanned: <strong>{collectedCount}/{totalChunksCount}</strong></span>
                        </div>

                        {missingIndices.length > 0 ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", overflow: "hidden", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.7)", flexShrink: 0 }}>
                              Need:
                            </span>
                            {missingIndices.length <= 3 ? (
                              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {missingIndices.map((partNum) => (
                                  <span
                                    key={partNum}
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "5px",
                                      backgroundColor: "var(--accent-color)",
                                      color: "#ffffff",
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Part {partNum}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {missingIndices.slice(0, 2).map((partNum) => (
                                  <span
                                    key={partNum}
                                    style={{
                                      padding: "2px 5px",
                                      borderRadius: "4px",
                                      backgroundColor: "var(--accent-color)",
                                      color: "#ffffff",
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                    }}
                                  >
                                    P{partNum}
                                  </span>
                                ))}
                                <span
                                  style={{
                                    padding: "2px 5px",
                                    borderRadius: "4px",
                                    backgroundColor: "rgba(255,255,255,0.2)",
                                    color: "#fff",
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  +{missingIndices.length - 2} more
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--success-color)", fontWeight: 700, fontSize: "0.74rem" }}>
                            ✓ All {totalChunksCount} ready
                          </span>
                        )}
                      </div>
                    )}

                    {/* Camera Control Bar: Refocus, Torch, Flip */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "10px",
                        left: "10px",
                        right: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        zIndex: 6,
                        pointerEvents: "none",
                      }}
                    >
                      {/* Refocus Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerAutofocus();
                        }}
                        style={{
                          pointerEvents: "auto",
                          padding: "6px 12px",
                          borderRadius: "20px",
                          backgroundColor: isFocusing ? "var(--accent-color)" : "rgba(15, 23, 42, 0.75)",
                          backdropFilter: "blur(6px)",
                          color: "#fff",
                          border: "1px solid rgba(255,255,255,0.25)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                          transition: "all 0.15s ease",
                        }}
                        title="Tap to focus camera"
                      >
                        <Focus size={13} />
                        <span>{isFocusing ? "Focusing..." : "Tap to Focus"}</span>
                      </button>

                      <div style={{ display: "flex", gap: "6px", pointerEvents: "auto" }}>
                        {/* Torch Button */}
                        {hasTorch && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTorch();
                            }}
                            style={{
                              padding: "7px",
                              borderRadius: "50%",
                              backgroundColor: isTorchOn ? "#fbbf24" : "rgba(15, 23, 42, 0.75)",
                              backdropFilter: "blur(6px)",
                              color: isTorchOn ? "#0f172a" : "#fff",
                              border: "1px solid rgba(255,255,255,0.25)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                            }}
                            title="Toggle Flash"
                          >
                            <Zap size={14} />
                          </button>
                        )}

                        {/* Flip Camera Button */}
                        {hasMultipleCameras && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFacingMode();
                            }}
                            style={{
                              padding: "7px",
                              borderRadius: "50%",
                              backgroundColor: "rgba(15, 23, 42, 0.75)",
                              backdropFilter: "blur(6px)",
                              color: "#fff",
                              border: "1px solid rgba(255,255,255,0.25)",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                            }}
                            title="Flip Camera"
                          >
                            <SwitchCamera size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status caption & Quick Snap Photo */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", width: "100%" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                    {decrypting
                      ? "Decompressing and verifying package..."
                      : isMultiPart
                      ? missingIndices.length > 0
                        ? `Point camera at missing Part ${missingIndices.join(", ")}`
                        : "All parts captured! Importing..."
                      : "Point your camera at the QR code"}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    id="qr-camera-snap-input"
                    style={{ display: "none" }}
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    className="notion-btn secondary"
                    style={{ fontSize: "0.78rem", padding: "5px 12px", display: "flex", alignItems: "center", gap: "5px", borderRadius: "6px" }}
                    onClick={() => document.getElementById("qr-camera-snap-input")?.click()}
                  >
                    <Camera size={13} /> Snap Hi-Res Photo
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: QR IMAGE / PHOTO UPLOAD */}
            {scanMode === "image" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    padding: "36px 20px",
                    borderRadius: "12px",
                    border: "2px dashed var(--border-color)",
                    backgroundColor: "var(--bg-secondary)",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      backgroundColor: "var(--accent-light)",
                      color: "var(--accent-color)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Upload size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Choose or Drop QR Code Image
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Supports PNG, JPG, WebP photos or QR screenshots
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*,.oxshare,.json,.txt"
                    onChange={handleImageUpload}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            )}

            {/* TAB 3: MANUAL PAYLOAD INPUT */}
            {scanMode === "manual" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Encrypted QR Code Payload:
                  </label>
                  <button
                    type="button"
                    className="notion-btn secondary"
                    style={{ padding: "3px 8px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                    onClick={handlePasteClipboard}
                  >
                    <Clipboard size={12} /> Paste
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  placeholder="Paste OXCHUNK:1:... or OXSHARE1:... code string..."
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

                <button
                  type="button"
                  className="notion-btn primary"
                  style={{ padding: "9px 16px", fontSize: "0.88rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  onClick={handleManualDecrypt}
                  disabled={decrypting || !qrToken.trim()}
                >
                  {decrypting ? "Decrypting..." : "Decrypt & Import"}
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </>
        )}

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--danger-color)",
              backgroundColor: "rgba(225, 29, 72, 0.1)",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              border: "1px solid rgba(225, 29, 72, 0.25)",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes qrScanLaser {
          0% { transform: translateY(-70px); opacity: 0.2; }
          50% { transform: translateY(70px); opacity: 1; }
          100% { transform: translateY(-70px); opacity: 0.2; }
        }
        @keyframes focusRingPulse {
          0% { transform: translate(-50%, -50%) scale(1.6); opacity: 0.2; border-color: #fbbf24; }
          40% { transform: translate(-50%, -50%) scale(1); opacity: 1; border-color: #fbbf24; }
          80% { transform: translate(-50%, -50%) scale(1); opacity: 1; border-color: #10b981; }
          100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
