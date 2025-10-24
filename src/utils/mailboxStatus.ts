import type { SyncProgress, SyncReport } from "../types";

export type StatusPillTone = "active" | "warning" | "neutral";

export interface StatusPill {
  key: string;
  text: string;
  tone?: StatusPillTone;
}

interface BuildStatusPillsOptions {
  isSyncing: boolean;
  isRefreshing: boolean;
  syncReport: SyncReport | null;
  syncProgress: SyncProgress | null;
  emailsCount: number;
  totalKnownMessages: number;
}

export function buildSyncStatusPills({
  isSyncing,
  isRefreshing,
  syncReport,
  syncProgress,
  emailsCount,
  totalKnownMessages
}: BuildStatusPillsOptions): StatusPill[] {
  const pills: StatusPill[] = [];

  const progressPercent =
    syncProgress && syncProgress.total_batches > 0
      ? Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))
      : null;

  if (isSyncing) {
    pills.push({
      key: "syncing",
      text: progressPercent !== null ? `Syncing • ${progressPercent}%` : "Syncing…",
      tone: "active"
    });
    
    // Show batch progress during sync
    if (syncProgress && syncProgress.total_batches > 0) {
      pills.push({
        key: "progress",
        text: `Batch ${syncProgress.batch}/${syncProgress.total_batches}`,
        tone: "warning"
      });
    }
    
    // Show total fetched during sync
    if (syncProgress && syncProgress.fetched > 0) {
      pills.push({
        key: "fetched",
        text: `${syncProgress.fetched.toLocaleString()} fetched`,
        tone: "neutral"
      });
    }
  } else if (isRefreshing) {
    pills.push({
      key: "refresh",
      text: "Refreshing mailbox…",
      tone: "active"
    });
  } else if (syncReport) {
    pills.push({
      key: "sync-complete",
      text: `Last sync fetched ${syncReport.fetched.toLocaleString()}`,
      tone: "neutral"
    });
  } else {
    pills.push({ key: "idle", text: "Ready to sync", tone: "neutral" });
  }

  if (totalKnownMessages > 0) {
    pills.push({
      key: "cached",
      text: `${emailsCount.toLocaleString()} of ${totalKnownMessages.toLocaleString()} cached`,
      tone: "neutral"
    });
  }

  return pills;
}
