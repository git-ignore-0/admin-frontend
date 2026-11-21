"use client";

import { Notifications, notifications, notificationsStore } from "@mantine/notifications";
import { IconCheck, IconExclamationMark } from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAdminI18n } from "@/components/admin-i18n-provider";

type ToastType = "success" | "error";
const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null);

/** Clear the Mantine store as well as its queue when a protected admin session changes. */
const RESET_NOTIFICATIONS_EVENT = "nfv-admin-clear-notifications";
export function clearAdminNotifications() {
  notifications.clean();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RESET_NOTIFICATIONS_EVENT));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useAdminI18n();
  const [instance, setInstance] = useState(0);
  const acceptsNotifications = useRef(true);
  useEffect(() => {
    acceptsNotifications.current = true;
    const reset = () => {
      acceptsNotifications.current = false;
      setInstance((current) => current + 1);
    };
    window.addEventListener(RESET_NOTIFICATIONS_EVENT, reset);
    return () => {
      window.removeEventListener(RESET_NOTIFICATIONS_EVENT, reset);
      acceptsNotifications.current = false;
      notifications.clean();
    };
  }, []);
  useEffect(() => {
    notifications.updateState(notificationsStore, (items) =>
      items.map((item) => ({
        ...item,
        closeButtonProps: { ...item.closeButtonProps, "aria-label": t.toast.close },
      })),
    );
  }, [t.toast.close]);
  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      if (!acceptsNotifications.current) return;
      notifications.show({
        message,
        color: type === "error" ? "red" : "green",
        icon:
          type === "error" ? (
            <IconExclamationMark size={18} aria-hidden />
          ) : (
            <IconCheck size={18} aria-hidden />
          ),
        role: type === "error" ? "alert" : "status",
        "aria-live": type === "error" ? "assertive" : "polite",
        closeButtonProps: { "aria-label": t.toast.close },
        autoClose: 4500,
        withBorder: true,
      });
    },
    [t.toast.close],
  );
  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Notifications key={instance} position="top-right" limit={3} autoClose={4500} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
