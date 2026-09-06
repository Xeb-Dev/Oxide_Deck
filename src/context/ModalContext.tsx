import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import ConfirmModal from "../components/ConfirmModal";

export interface ModalOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary" | "info";
}

interface ModalContextType {
  alert: (optionsOrMessage: string | ModalOptions) => Promise<void>;
  confirm: (optionsOrMessage: string | ModalOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

interface ModalState extends ModalOptions {
  isOpen: boolean;
  isAlert: boolean;
  resolve: (value: any) => void;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const alert = useCallback((optionsOrMessage: string | ModalOptions): Promise<void> => {
    const options: ModalOptions =
      typeof optionsOrMessage === "string"
        ? { message: optionsOrMessage, title: "Notice" }
        : optionsOrMessage;

    return new Promise<void>((resolve) => {
      setModalState({
        isOpen: true,
        isAlert: true,
        title: options.title || "Notice",
        message: options.message,
        confirmLabel: options.confirmLabel || "OK",
        variant: options.variant || "info",
        resolve,
      });
    });
  }, []);

  const confirm = useCallback((optionsOrMessage: string | ModalOptions): Promise<boolean> => {
    const options: ModalOptions =
      typeof optionsOrMessage === "string"
        ? { message: optionsOrMessage, title: "Are you sure?" }
        : optionsOrMessage;

    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        isAlert: false,
        title: options.title || "Are you sure?",
        message: options.message,
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        variant: options.variant || "danger",
        resolve,
      });
    });
  }, []);

  // Intercept native window.alert to display via our custom in-app popup window
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message?: any) => {
      alert(String(message ?? ""));
    };
    return () => {
      window.alert = originalAlert;
    };
  }, [alert]);

  const handleConfirm = useCallback(() => {
    if (modalState) {
      modalState.resolve(true);
      setModalState(null);
    }
  }, [modalState]);

  const handleCancel = useCallback(() => {
    if (modalState) {
      modalState.resolve(false);
      setModalState(null);
    }
  }, [modalState]);

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}
      {modalState && (
        <ConfirmModal
          isOpen={modalState.isOpen}
          title={modalState.title}
          message={modalState.message}
          confirmLabel={modalState.confirmLabel}
          cancelLabel={modalState.cancelLabel}
          variant={modalState.variant}
          isAlert={modalState.isAlert}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextType {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}
