import React, { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { SenderStatus } from "../types";
import { STATUS_META } from "./statusMeta";
import { useStatusDialog } from "../stores/statusDialog";

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
  const { open, isProcessing: dialogProcessing } = useStatusDialog();
  // Only use isUpdating prop - dialogProcessing is global and would affect all instances
  const isBusy = isUpdating;

  const statusInfo = useMemo(() => STATUS_META[currentStatus], [currentStatus]);

  const buttonContent = useMemo(() => {
    if (isBusy) {
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
      return "Set status";
    }
    return pieces.join(" ");
  }, [isBusy, showIcon, showLabel, statusInfo]);

  const cssClass = useMemo(() => {
    const base = ["email-action-dropdown", `status-${currentStatus}`];
    if (size === "small") {
      base.push("size-small");
    }
    if (isBusy) {
      base.push("is-updating");
    }
    return base.join(" ");
  }, [currentStatus, isBusy, size]);

  const handleStatusChange = useCallback(async (newStatus: SenderStatus) => {
    if (newStatus === currentStatus) {
      return;
    }

    if (onStatusChange) {
      await onStatusChange(newStatus);
    } else {
      await invoke("set_sender_status", {
        senderEmail: email,
        status: newStatus
      });
    }
  }, [currentStatus, email, onStatusChange]);

  const handleButtonClick = useCallback(() => {
    if (isBusy) {
      return;
    }

    open({
      email,
      currentStatus,
      onSubmit: handleStatusChange,
      onComplete: onActionComplete
    });
  }, [currentStatus, email, handleStatusChange, isBusy, onActionComplete, open]);

  return (
    <button
      type="button"
      onClick={handleButtonClick}
      disabled={isBusy}
      className={cssClass}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showIcon && showLabel ? 6 : 0,
        padding: size === "small" ? "4px 12px" : "6px 16px",
        fontSize: size === "small" ? "12px" : "13px",
        borderRadius: "999px",
        border: `1px solid ${statusInfo.buttonBorder}`,
        cursor: isBusy ? "not-allowed" : "pointer",
        backgroundColor: statusInfo.buttonBg,
        color: statusInfo.accent,
        transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease",
        whiteSpace: "nowrap",
        fontWeight: 600,
        minHeight: size === "small" ? 24 : 28,
        opacity: isBusy ? 0.65 : 1
      }}
      data-status={currentStatus}
      aria-label={`Change status for ${email}`}
    >
      {buttonContent}
    </button>
  );
};
