import type { SenderStatus } from "../types";

type StatusVisualMeta = {
  icon: string;
  label: string;
  accent: string;
  buttonBg: string;
  buttonHover: string;
  buttonBorder: string;
};

export const STATUS_META: Record<SenderStatus, StatusVisualMeta> = {
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

export const STATUS_ACTIONS: Array<{ id: SenderStatus; label: string; icon: string }> = [
  { id: "allowed", label: "Allow Sender", icon: "✓" },
  { id: "neutral", label: "Mark Neutral", icon: "○" },
  { id: "blocked", label: "Block Sender", icon: "✕" }
];
