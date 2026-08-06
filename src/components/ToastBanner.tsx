import { useEffect, useState } from "react";
import { Bell, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { subscribeToToasts } from "../services/notificationService";

interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success';
}

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
};

export default function ToastBanner() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts(({ title, body, type = 'info' }) => {
      const id = crypto.randomUUID();
      setToasts(prev => [...prev, { id, title, body, type }]);

      // Auto dismiss after 5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    });

    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: "1.25rem",
      right: "1.25rem",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
      maxWidth: "380px",
      width: "calc(100vw - 2.5rem)",
      pointerEvents: "none"
    }}>
      {toasts.map(toast => {
        const Icon = ICONS[toast.type] || Bell;
        const borderColor = toast.type === 'warning' ? '#f59e0b' : toast.type === 'success' ? '#10b981' : '#6366f1';
        
        return (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              padding: "0.875rem 1rem",
              backgroundColor: "var(--color-bg-elevated, #ffffff)",
              color: "var(--color-text, #1f2937)",
              borderRadius: "0.75rem",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              borderLeft: `4px solid ${borderColor}`,
              border: "1px solid var(--color-border, rgba(0,0,0,0.08))",
              animation: "toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            <div style={{ color: borderColor, marginTop: "0.125rem", flexShrink: 0 }}>
              <Icon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                {toast.title}
              </div>
              <div style={{ fontSize: "0.8125rem", opacity: 0.85, lineHeight: 1.4 }}>
                {toast.body}
              </div>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.25rem",
                opacity: 0.6,
                color: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.375rem"
              }}
              aria-label="Close notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
