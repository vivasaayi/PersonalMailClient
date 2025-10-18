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
  const progressPercent =
    syncProgress && syncProgress.total_batches > 0
      ? Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))
      : null;

  const cachedMeta =
    totalKnownMessages > emailsCount
      ? `Showing ${emailsCount.toLocaleString()} of ${totalKnownMessages.toLocaleString()} cached messages`
      : totalKnownMessages === 0
        ? "Start a sync to populate your mailbox."
        : "All cached messages are visible.";

  const lastSyncValue = syncReport ? `${syncReport.fetched.toLocaleString()} fetched` : "Awaiting first run";
  const lastSyncMeta = syncReport
    ? `${syncReport.stored.toLocaleString()} stored • Completed in ${formatDuration(syncReport.duration_ms)}`
    : "Run a full sync to populate mailbox analytics.";

  const syncHealthMeta =
    syncProgress && syncProgress.total_batches > 0
      ? `Batch ${syncProgress.batch}/${syncProgress.total_batches} • ${syncProgress.fetched.toLocaleString()} fetched so far`
      : "Kick off a sync to refresh data.";

  return (
    <section className="mailbox-summary">
      <div className="mailbox-summary__item">
        <span className="mailbox-summary__label">Cached view</span>
        <span className="mailbox-summary__value">{emailsCount.toLocaleString()}</span>
        <span className="mailbox-summary__meta">{cachedMeta}</span>
      </div>
      <div className="mailbox-summary__item">
        <span className="mailbox-summary__label">Last sync</span>
        <span className="mailbox-summary__value">{lastSyncValue}</span>
        <span className="mailbox-summary__meta">{lastSyncMeta}</span>
      </div>
      <div className="mailbox-summary__item">
        <span className="mailbox-summary__label">Sync health</span>
        <span className="mailbox-summary__value">{isSyncing ? "In progress" : "Idle"}</span>
        <span className="mailbox-summary__meta">{syncHealthMeta}</span>
        {progressPercent !== null && (
          <div className="mailbox-progress-bar">
            <ProgressBarComponent value={progressPercent} type="Linear" height="8px" />
          </div>
        )}
      </div>
    </section>
  );
}
