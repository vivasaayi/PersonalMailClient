import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { SenderStatus } from "../types";

const STATUS_META: Record<SenderStatus, {
  icon: string;
  label: string;
  accent: string;
  buttonBg: string;
  buttonHover: string;
  buttonBorder: string;
}> = {
  neutral: {
    icon: "○",
    label: "Neutral",
    accent: "#374151",
    buttonBg: "#f9fafb",
    buttonHover: "#f3f4f6",
    buttonBorder: "#d1d5db"
  },
  allowed: {
    icon: "✓",
    label: "Allowed",
    accent: "#047857",
    buttonBg: "#d1fae5",
    buttonHover: "#bbf7d0",
    buttonBorder: "#34d399"
  },
  blocked: {
    icon: "✕",
    label: "Blocked",
    accent: "#b91c1c",
    buttonBg: "#fee2e2",
    buttonHover: "#fecaca",
    buttonBorder: "#f87171"
  }
};

const MENU_OPTIONS: Array<{ id: SenderStatus; label: string; icon: string }> = [
  { id: "allowed", label: "Allow Sender", icon: "✓" },
  { id: "neutral", label: "Mark Neutral", icon: "○" },
  { id: "blocked", label: "Block Sender", icon: "✕" }
];

interface EmailActionDropdownProps {
  email: string;
  currentStatus?: SenderStatus;
  size?: "small" | "normal";
  showLabel?: boolean;
  showIcon?: boolean;
  isUpdating?: boolean;
  onStatusChange?: (status: SenderStatus) => Promise<void>;
  onActionComplete?: () => void;
}

export const EmailActionDropdown: React.FC<EmailActionDropdownProps> = ({
  email,
  currentStatus = "neutral",
  size = "small",
  showLabel = true,
  showIcon = true,
  isUpdating = false,
  onStatusChange,
  onActionComplete
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<SenderStatus | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const statusInfo = useMemo(() => STATUS_META[currentStatus], [currentStatus]);

  // Handle status change
  const handleStatusChange = useCallback(async (newStatus: SenderStatus) => {
    if (newStatus === currentStatus) {
      return;
    }
    try {
      setIsProcessing(true);
      if (onStatusChange) {
        await onStatusChange(newStatus);
      } else {
        await invoke("set_sender_status", {
          senderEmail: email,
          status: newStatus
        });
      }
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (error) {
      console.error("Failed to change sender status:", error);
    } finally {
      setIsProcessing(false);
      setMenuOpen(false);
    }
  }, [currentStatus, email, onActionComplete, onStatusChange]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const node = containerRef.current;
      if (node && !node.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const menuItems = useMemo(
    () =>
      MENU_OPTIONS.map((option) => ({
        ...option,
        disabled: option.id === currentStatus
      })),
    [currentStatus]
  );

  const buttonContent = useMemo(() => {
    if (isProcessing || isUpdating) {
      return "Updating…";
    }
    const pieces: string[] = [];
    if (showIcon) {
      pieces.push(statusInfo.icon);
    }
    if (showLabel) {
      pieces.push(statusInfo.label);
    }
    if (pieces.length === 0) {
      return "⋮";
    }
    return pieces.join(" ");
  }, [isProcessing, isUpdating, showIcon, showLabel, statusInfo]);

  const cssClass = useMemo(() => {
    const base = ["email-action-dropdown", `status-${currentStatus}`];
    if (size === "small") {
      base.push("size-small");
    }
    if (isProcessing || isUpdating) {
      base.push("is-updating");
    }
    if (menuOpen) {
      base.push("is-open");
    }
    return base.join(" ");
  }, [currentStatus, isProcessing, isUpdating, menuOpen, size]);

  useEffect(() => {
    if (!menuOpen) {
      setHoveredItem(null);
    }
  }, [menuOpen]);

  const toggleMenu = useCallback(() => {
    if (isProcessing || isUpdating) {
      return;
    }
    setMenuOpen((prev) => !prev);
  }, [isProcessing, isUpdating]);

  const getItemAccent = useCallback((status: SenderStatus) => STATUS_META[status].accent, []);

  return (
    <div
      ref={containerRef}
      className={cssClass}
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        type="button"
        onClick={toggleMenu}
        disabled={isProcessing || isUpdating}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: showIcon && showLabel ? 6 : 0,
          padding: size === "small" ? "4px 12px" : "6px 16px",
          fontSize: size === "small" ? "12px" : "13px",
          borderRadius: "999px",
          border: `1px solid ${statusInfo.buttonBorder}`,
          cursor: isProcessing || isUpdating ? "not-allowed" : "pointer",
          backgroundColor: menuOpen ? statusInfo.buttonHover : statusInfo.buttonBg,
          color: statusInfo.accent,
          transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease",
          whiteSpace: "nowrap",
          fontWeight: 600,
          minHeight: size === "small" ? 24 : 28,
          opacity: isProcessing || isUpdating ? 0.65 : 1
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-status={currentStatus}
      >
        {buttonContent}
      </button>
      {menuOpen && !isProcessing && !isUpdating && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 176,
            padding: "6px",
            borderRadius: 8,
            border: "1px solid rgba(209, 213, 219, 1)",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
            backgroundColor: "#ffffff",
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 4
          }}
        >
          {menuItems.map((item) => {
            const isActive = currentStatus === item.id;
            const isHovered = hoveredItem === item.id;
            const accent = getItemAccent(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.disabled) {
                    void handleStatusChange(item.id);
                  }
                }}
                disabled={item.disabled}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                role="menuitem"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: isActive
                    ? `1px solid ${STATUS_META[item.id].buttonBorder}`
                    : "1px solid transparent",
                  backgroundColor: item.disabled
                    ? "#f3f4f6"
                    : isHovered || isActive
                    ? STATUS_META[item.id].buttonHover
                    : "transparent",
                  color: item.disabled ? "#9ca3af" : accent,
                  cursor: item.disabled ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  textAlign: "left",
                  transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease"
                }}
              >
                <span aria-hidden="true" style={{ fontSize: "14px", width: 16 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
