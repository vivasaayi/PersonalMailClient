import { useEffect, useMemo, useRef } from "react";
import { useNotifications } from "../stores/notifications";

export default function NotificationsHost() {
  const { notifications, dismiss } = useNotifications();
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    notifications.forEach((notification) => {
      if (!notification.persistent && !timersRef.current.has(notification.id)) {
        const timeoutId = window.setTimeout(() => {
          dismiss(notification.id);
          timersRef.current.delete(notification.id);
        }, 4000);
        timersRef.current.set(notification.id, timeoutId);
      }
      if (notification.persistent && timersRef.current.has(notification.id)) {
        const timeoutId = timersRef.current.get(notification.id);
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          timersRef.current.delete(notification.id);
        }
      }
    });

    timersRef.current.forEach((timeoutId, id) => {
      const stillVisible = notifications.some((notification) => notification.id === id);
      if (!stillVisible) {
        window.clearTimeout(timeoutId);
        timersRef.current.delete(id);
      }
    });

    return () => {
      timersRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timersRef.current.clear();
    };
  }, [notifications, dismiss]);

  const rendered = useMemo(() => (
    <div
      style={{
        position: "fixed",
        top: 24,
        right: 24,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 360,
      }}
    >
      {notifications.map((notification) => {
        let background = "#1f2937";
        if (notification.variant === "success") {
          background = "#166534";
        } else if (notification.variant === "error") {
          background = "#b91c1c";
        }
        return (
          <div
            key={notification.id}
            style={{
              background,
              color: "#ffffff",
              padding: "12px 16px",
              borderRadius: 8,
              boxShadow: "0 10px 25px -12px rgba(15,15,15,0.6)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{notification.message}</span>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  ), [notifications, dismiss]);

  return rendered;
}
