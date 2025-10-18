import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type NotificationVariant = "info" | "success" | "error";

export interface NotificationItem {
  id: string;
  message: string;
  variant: NotificationVariant;
  persistent?: boolean;
}

interface NotificationsContextValue {
  notifications: NotificationItem[];
  notify: (message: string, variant?: NotificationVariant, options?: { id?: string; persistent?: boolean }) => string;
  dismiss: (id: string) => void;
  notifyError: (message: string) => string;
  notifySuccess: (message: string) => string;
  notifyInfo: (message: string) => string;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, variant: NotificationVariant = "info", options?: { id?: string; persistent?: boolean }) => {
      const id = options?.id ?? createId();
      setNotifications((prev) => [...prev, { id, message, variant, persistent: options?.persistent }]);
      return id;
    },
    []
  );

  const value = useMemo<NotificationsContextValue>(() => ({
    notifications,
    notify,
    dismiss,
    notifyError: (message: string) => notify(message, "error", { persistent: true }),
    notifySuccess: (message: string) => notify(message, "success"),
    notifyInfo: (message: string) => notify(message, "info"),
  }), [notifications, notify, dismiss]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
