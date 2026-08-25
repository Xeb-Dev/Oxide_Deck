import { useEffect, useState } from "react";
import { Bell, AlertTriangle, CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { subscribeToToasts } from "../services/notificationService";

interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
  error: AlertCircle,
};

export default function ToastBanner() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts(({ title, body, type = 'info' }) => {
      setToasts(prev => {
        if (prev.some(t => t.title === title && t.body === body)) {
          return prev;
        }
        const id = crypto.randomUUID();
        setTimeout(() => {
          setToasts(current => current.filter(t => t.id !== id));
        }, 4500);

        return [...prev, { id, title, body, type: type as any }];
      });
    });

    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-banner-container" aria-live="polite" aria-atomic="true">
      {toasts.map(toast => {
        const Icon = ICONS[toast.type] || Bell;
        const variantClass = `toast-item--${toast.type || 'info'}`;

        return (
          <div
            key={toast.id}
            className={`toast-item ${variantClass}`}
            role="alert"
          >
            <div className="toast-item-icon-wrapper">
              <Icon size={18} />
            </div>

            <div className="toast-item-content">
              <div className="toast-item-title">
                {toast.title}
              </div>
              <div className="toast-item-body">
                {toast.body}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="toast-item-dismiss"
              aria-label="Close notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
