"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin-i18n-provider";

type ToastType = "success" | "error";
type Toast = { id: number; message: string; type: ToastType };

const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useAdminI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-2), { id, message, type }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            className={`toast ${toast.type}`}
            role={toast.type === "error" ? "alert" : "status"}
            key={toast.id}
          >
            <span className="toast-icon" aria-hidden="true">
              {toast.type === "success" ? "✓" : "!"}
            </span>
            <span>{toast.message}</span>
            <button type="button" aria-label={t.toast.close} onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
