import { useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary" | "info";
  isAlert?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function ConfirmModal({
  isOpen,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isAlert = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const handleDismiss = () => {
    if (isAlert) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isAlert, onConfirm, onCancel]);

  if (!isOpen) return null;

  let iconColor = "#e11d48";
  let iconBg = "rgba(225, 29, 72, 0.12)";
  let IconComponent = AlertTriangle;
  let confirmBtnBg: string | undefined = "#e11d48";

  if (variant === "warning") {
    iconColor = "#d97706";
    iconBg = "rgba(245, 158, 11, 0.14)";
    IconComponent = AlertCircle;
    confirmBtnBg = "#d97706";
  } else if (variant === "info" || variant === "primary") {
    iconColor = "var(--accent-color)";
    iconBg = "var(--accent-light)";
    IconComponent = Info;
    confirmBtnBg = undefined; // uses default notion-btn primary
  }

  return (
    <div
      className="notion-modal-overlay"
      style={{
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleDismiss}
    >
      <div
        className="notion-modal"
        style={{
          width: "90vw",
          maxWidth: "440px",
          padding: "24px",
          borderRadius: "14px",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          animation: "modalFadeIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              backgroundColor: iconBg,
              color: iconColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <IconComponent size={22} />
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: "1.1rem",
                color: "var(--text-primary)",
                fontFamily: "var(--font-title)",
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: "0.88rem",
                color: "var(--text-secondary)",
                marginTop: "6px",
                lineHeight: 1.5,
                whiteSpace: "pre-line",
              }}
            >
              {message}
            </div>
          </div>

          <button
            className="theme-toggle-btn"
            onClick={handleDismiss}
            style={{ padding: "4px", color: "var(--text-muted)", marginLeft: "-4px" }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          {!isAlert && onCancel && (
            <button
              type="button"
              className="notion-btn secondary"
              onClick={onCancel}
              style={{ padding: "8px 18px", fontSize: "0.9rem" }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={variant === "danger" || variant === "warning" ? "notion-btn danger" : "notion-btn primary"}
            onClick={onConfirm}
            style={{
              padding: "8px 20px",
              fontSize: "0.9rem",
              fontWeight: 600,
              backgroundColor: confirmBtnBg,
              color: "#fff",
            }}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
