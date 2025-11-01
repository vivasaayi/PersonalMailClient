import { useMemo } from "react";
import type { SyncProgress } from "../types";

interface StatusBannerProps {
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncTime: number | null;
  totalEmails: number;
}

export function StatusBanner({
  isSyncing,
  syncProgress,
  lastSyncTime,
  totalEmails
}: StatusBannerProps) {
  const statusMessage = useMemo(() => {
    if (isSyncing && syncProgress) {
      const { batch, total_batches, fetched, stored } = syncProgress;
      if (total_batches > 0) {
        const progressPercent = Math.round((batch / total_batches) * 100);
        return `Syncing... ${progressPercent}% complete (${fetched} fetched, ${stored} stored)`;
      }
      return `Syncing... ${fetched} messages fetched, ${stored} stored`;
    }

    if (lastSyncTime) {
      const timeAgo = Math.floor((Date.now() - lastSyncTime) / 1000 / 60);
      if (timeAgo < 1) {
        return "Synced just now";
      } else if (timeAgo === 1) {
        return "Synced 1 minute ago";
      } else if (timeAgo < 60) {
        return `Synced ${timeAgo} minutes ago`;
      } else {
        const hours = Math.floor(timeAgo / 60);
        return `Synced ${hours} hour${hours > 1 ? 's' : ''} ago`;
      }
    }

    return "Ready to sync";
  }, [isSyncing, syncProgress, lastSyncTime]);

  return (
    <div style={{
      padding: "12px 16px",
      backgroundColor: "#f8fafc",
      borderBottom: "1px solid #e2e8f0",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ fontSize: "14px", color: "#374151" }}>
          {statusMessage}
        </div>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>
          {totalEmails} emails total
        </div>
      </div>
    </div>
  );
}