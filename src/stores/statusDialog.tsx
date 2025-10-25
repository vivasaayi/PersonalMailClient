import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import type { SenderStatus } from "../types";
import { STATUS_META, STATUS_ACTIONS } from "../components/statusMeta";

type StatusDialogRequest = {
  email: string;
  currentStatus: SenderStatus;
  onSubmit: (status: SenderStatus) => Promise<void> | void;
  onComplete?: () => void;
};

type StatusDialogContextValue = {
  open: (request: StatusDialogRequest) => void;
  close: () => void;
  isOpen: boolean;
  isProcessing: boolean;
};

const StatusDialogContext = createContext<StatusDialogContextValue | undefined>(undefined);

type DialogState = {
  isOpen: boolean;
  isProcessing: boolean;
};

export function StatusDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState>({ isOpen: false, isProcessing: false });
  const [email, setEmail] = useState<string>("");
  const requestRef = useRef<StatusDialogRequest | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const suppressBackdropCloseRef = useRef(false);
  const titleId = React.useId();
  const descriptionId = useMemo(() => `${titleId}-description`, [titleId]);

  const open = useCallback((request: StatusDialogRequest) => {
    requestRef.current = request;
    setEmail(request.email);
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    suppressBackdropCloseRef.current = true;
    setDialogState({ isOpen: true, isProcessing: false });
  }, []);

  const close = useCallback(() => {
    setDialogState((prev) => {
      if (!prev.isOpen || prev.isProcessing) {
        return prev;
      }
      return { isOpen: false, isProcessing: false };
    });
    requestRef.current = null;
  }, []);

  const beginProcessing = useCallback(() => {
    setDialogState({ isOpen: true, isProcessing: true });
  }, []);

  const endProcessing = useCallback(() => {
    setDialogState({ isOpen: false, isProcessing: false });
    requestRef.current = null;
  }, []);

  useEffect(() => {
    if (!dialogState.isOpen) {
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget) {
        const frame = window.requestAnimationFrame(() => {
          restoreTarget.focus();
          restoreFocusRef.current = null;
        });
        return () => window.cancelAnimationFrame(frame);
      }
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      suppressBackdropCloseRef.current = false;
      firstOptionRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
      suppressBackdropCloseRef.current = false;
    };
  }, [dialogState.isOpen]);

  useEffect(() => {
    if (!dialogState.isOpen) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [close, dialogState.isOpen]);

  const handleSubmit = useCallback(async (nextStatus: SenderStatus) => {
    const request = requestRef.current;
    if (!request) {
      return;
    }

    if (nextStatus === request.currentStatus) {
      close();
      return;
    }

    try {
      beginProcessing();
      await request.onSubmit(nextStatus);
      request.onComplete?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update sender status:", error);
    } finally {
      endProcessing();
    }
  }, [beginProcessing, close, endProcessing]);

  const firstEnabledOption = (() => {
    const request = requestRef.current;
    if (!request) {
      return null;
    }
    return STATUS_ACTIONS.find((option) => option.id !== request.currentStatus)?.id ?? null;
  })();

  const contextValue = useMemo<StatusDialogContextValue>(
    () => ({
      open,
      close,
      isOpen: dialogState.isOpen,
      isProcessing: dialogState.isProcessing
    }),
    [close, dialogState.isOpen, dialogState.isProcessing, open]
  );

  return (
    <StatusDialogContext.Provider value={contextValue}>
      {children}
      {dialogState.isOpen && requestRef.current
        ? createPortal(
            <div
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.55)",
                zIndex: 13000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px"
              }}
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }
                if (dialogState.isProcessing || suppressBackdropCloseRef.current) {
                  return;
                }
                close();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                style={{
                  width: "min(320px, 90vw)",
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  border: "1px solid rgba(209, 213, 219, 0.6)",
                  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.25)",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px"
                }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <h3
                    id={titleId}
                    style={{
                      margin: 0,
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#111827"
                    }}
                  >
                    Update sender status
                  </h3>
                  <p
                    id={descriptionId}
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      color: "#4b5563",
                      wordBreak: "break-word"
                    }}
                  >
                    {email}
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {STATUS_ACTIONS.map((item) => {
                    const isActive = requestRef.current?.currentStatus === item.id;
                    const palette = STATUS_META[item.id];
                    const isFirst = firstEnabledOption === item.id;

                    return (
                      <button
                        key={item.id}
                        ref={isFirst ? firstOptionRef : undefined}
                        type="button"
                        disabled={dialogState.isProcessing || item.id === requestRef.current?.currentStatus}
                        onClick={() => {
                          if (!dialogState.isProcessing && item.id !== requestRef.current?.currentStatus) {
                            void handleSubmit(item.id);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          gap: 12,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${isActive ? palette.buttonBorder : "rgba(209,213,219,0.7)"}`,
                          backgroundColor: isActive ? palette.buttonBg : "#ffffff",
                          color: palette.accent,
                          fontSize: "13px",
                          fontWeight: isActive ? 600 : 500,
                          cursor: dialogState.isProcessing ? "not-allowed" : "pointer",
                          transition: "transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease",
                          boxShadow: isActive
                            ? `0 0 0 2px ${palette.buttonHover}`
                            : "0 4px 12px rgba(15, 23, 42, 0.08)",
                          opacity: item.id === requestRef.current?.currentStatus ? 0.7 : 1
                        }}
                      >
                        <span aria-hidden="true" style={{ fontSize: "15px", width: 18 }}>
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    onClick={close}
                    disabled={dialogState.isProcessing}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#374151",
                      cursor: dialogState.isProcessing ? "not-allowed" : "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </StatusDialogContext.Provider>
  );
}

export function useStatusDialog() {
  const ctx = useContext(StatusDialogContext);
  if (!ctx) {
    throw new Error("useStatusDialog must be used within a StatusDialogProvider");
  }
  return ctx;
}
