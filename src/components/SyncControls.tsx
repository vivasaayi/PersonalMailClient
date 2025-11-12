import { useMemo } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type { SyncProgress } from "../types";

interface SyncControlsProps {
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  onFullSync: () => Promise<void>;
  onCancelSync: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function SyncControls({
  isSyncing,
  syncProgress,
  onFullSync,
  onCancelSync,
  onRefresh
}: SyncControlsProps) {
  const progressText = useMemo(() => {
    if (!syncProgress) return null;

    const { batch, total_batches, fetched, stored, elapsed_ms } = syncProgress;
    const elapsedSeconds = (elapsed_ms / 1000).toFixed(1);

    if (total_batches > 0) {
      const progressPercent = total_batches > 0 ? Math.round((batch / total_batches) * 100) : 0;
      return `Batch ${batch}/${total_batches} (${progressPercent}%) - ${fetched} fetched, ${stored} stored - ${elapsedSeconds}s`;
    }

    return `${fetched} messages fetched, ${stored} stored - ${elapsedSeconds}s`;
  }, [syncProgress]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
      <ButtonComponent
        cssClass="primary"
        content={isSyncing ? "Syncing..." : "Full Sync"}
        disabled={isSyncing}
        onClick={onFullSync}
      />

      {isSyncing && (
        <ButtonComponent
          cssClass="ghost-button"
          content="Cancel Sync"
          onClick={onCancelSync}
          style={{ borderColor: "#dc2626", color: "#dc2626" }}
        />
      )}

      <ButtonComponent
        cssClass="ghost-button"
        content="Refresh"
        disabled={isSyncing}
        onClick={onRefresh}
      />

      {progressText && (
        <div style={{
          fontSize: "14px",
          color: "#6b7280",
          flex: 1,
          textAlign: "right"
        }}>
          {progressText}
        </div>
      )}
    </div>
  );
}