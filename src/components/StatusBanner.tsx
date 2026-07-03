import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";

export type StatusVariant = "success" | "error" | "warning" | "info";

export interface StatusBannerProps {
  message: string;
  variant?: StatusVariant;
  loading?: boolean;
  onDismiss?: () => void;
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export default function StatusBanner({
  message,
  variant = "info",
  loading = false,
  onDismiss,
}: StatusBannerProps) {
  const Icon = ICONS[variant];

  return (
    <div className={`status-banner status-banner--${variant}`} role="alert">
      {loading ? (
        <Loader2 size={18} className="status-banner__spinner" aria-hidden="true" />
      ) : (
        <Icon size={18} className="status-banner__icon" aria-hidden="true" />
      )}
      <span className="status-banner__message">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="status-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
