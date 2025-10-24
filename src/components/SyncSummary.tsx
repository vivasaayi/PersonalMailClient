import { ProgressBarComponent } from "@syncfusion/ej2-react-progressbar";
import type { SyncProgress, SyncReport } from "../types";

export interface SyncSummaryProps {
  emailsCount: number;
  totalKnownMessages: number;
  syncReport: SyncReport | null;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
}

export const formatDuration = (ms: number) => {
  if (!ms || Number.isNaN(ms)) {
    return "0s";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
};

export function SyncSummary({ emailsCount, totalKnownMessages, syncReport, syncProgress, isSyncing }: SyncSummaryProps) {
  // All sync information is now displayed in the top status bar
  return null;
}
