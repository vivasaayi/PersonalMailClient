import type { SyncReport } from "../types";

interface AutomationPanelProps {
  periodicMinutes: number;
  onPeriodicMinutesChange: (value: number) => void;
  onSavePeriodicSync: () => Promise<void>;
  isSavingPeriodic: boolean;
  blockFolder: string;
  onBlockFolderChange: (value: string) => void;
  onApplyBlockFilter: () => Promise<void>;
  isApplyingBlockFilter: boolean;
  syncReport: SyncReport | null;
  onFullSync: () => Promise<void>;
  isSyncing: boolean;
}

export default function AutomationPanel({
  periodicMinutes,
  onPeriodicMinutesChange,
  onSavePeriodicSync,
  isSavingPeriodic,
  blockFolder,
  onBlockFolderChange,
  onApplyBlockFilter,
  isApplyingBlockFilter,
  syncReport,
  onFullSync,
  isSyncing
}: AutomationPanelProps) {
  return (
    <div className="tab-content automation-grid">
      <div className="automation-card">
        <h3>Periodic sync</h3>
        <p>Keep this mailbox fresh by syncing on a schedule.</p>
        <label className="field inline">
          <span>Interval (minutes)</span>
          <input
            type="number"
            min={0}
            step={5}
            value={periodicMinutes}
            onChange={(event) => onPeriodicMinutesChange(Number(event.target.value) || 0)}
          />
        </label>
        <button
          type="button"
          className="primary"
          onClick={onSavePeriodicSync}
          disabled={isSavingPeriodic}
        >
          {isSavingPeriodic ? "Saving…" : periodicMinutes > 0 ? "Enable" : "Disable"}
        </button>
        <small className="hint">
          Set to 0 to turn off periodic syncing.
        </small>
      </div>
      <div className="automation-card">
        <h3>Blocked sender filter</h3>
        <p>Move messages from blocked senders to a safer folder.</p>
        <label className="field inline">
          <span>Target folder</span>
          <input
            type="text"
            value={blockFolder}
            onChange={(event) => onBlockFolderChange(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary"
          onClick={onApplyBlockFilter}
          disabled={isApplyingBlockFilter}
        >
          {isApplyingBlockFilter ? "Applying…" : "Apply filter"}
        </button>
        <small className="hint">
          Leave blank to use the provider default "Blocked" folder.
        </small>
      </div>
      <div className="automation-card">
        <h3>Last full sync</h3>
        {syncReport ? (
          <ul className="sync-report">
            <li>
              <strong>Fetched:</strong> {syncReport.fetched}
            </li>
            <li>
              <strong>Stored:</strong> {syncReport.stored}
            </li>
            <li>
              <strong>Duration:</strong> {(syncReport.duration_ms / 1000).toFixed(1)}s
            </li>
          </ul>
        ) : (
          <p>No full sync run in this session yet.</p>
        )}
        <button
          type="button"
          className="outline"
          onClick={onFullSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing…" : "Run full sync"}
        </button>
      </div>
    </div>
  );
}