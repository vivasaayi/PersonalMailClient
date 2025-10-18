import type { Account, SyncProgress, SyncReport } from "../types";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { AccountStatusBanner } from "./AccountStatusBanner";
import { SyncSummary } from "./SyncSummary";
import { buildSyncStatusPills } from "../utils/mailboxStatus";

interface AutomationViewProps {
  account: Account | null;
  email: string | null;
  periodicMinutes: number;
  onPeriodicMinutesChange: (value: number) => void;
  onSavePeriodicSync: () => Promise<void>;
  isSavingPeriodic: boolean;
  blockFolder: string;
  onBlockFolderChange: (value: string) => void;
  onApplyBlockFilter: () => Promise<void>;
  isApplyingBlockFilter: boolean;
  syncReport: SyncReport | null;
  syncProgress: SyncProgress | null;
  onFullSync: () => Promise<void>;
  isSyncing: boolean;
  isRefreshing: boolean;
  emailsCount: number;
  totalKnownMessages: number;
}

const periodicOptions = [
  { value: 0, label: "Disabled" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 1440, label: "24 hours" }
];

export default function AutomationView({
  account,
  email,
  periodicMinutes,
  onPeriodicMinutesChange,
  onSavePeriodicSync,
  isSavingPeriodic,
  blockFolder,
  onBlockFolderChange,
  onApplyBlockFilter,
  isApplyingBlockFilter,
  syncReport,
  syncProgress,
  onFullSync,
  isSyncing,
  isRefreshing,
  emailsCount,
  totalKnownMessages
}: AutomationViewProps) {
  const statusPills = email
    ? buildSyncStatusPills({
        isSyncing,
        isRefreshing,
        syncReport,
        syncProgress,
        emailsCount,
        totalKnownMessages
      })
    : [];

  return (
    <div className="automation-shell">
      {email && (
        <AccountStatusBanner
          account={account ?? undefined}
          email={email}
          statusPills={statusPills}
          actions={
            <ButtonComponent
              cssClass="primary mailbox-action"
              content={isSyncing ? "Syncing…" : "Run full sync"}
              disabled={isSyncing}
              onClick={() => {
                void onFullSync();
              }}
            />
          }
        />
      )}

      {email && (
        <SyncSummary
          emailsCount={emailsCount}
          totalKnownMessages={totalKnownMessages}
          syncReport={syncReport}
          syncProgress={syncProgress}
          isSyncing={isSyncing || isRefreshing}
        />
      )}

      <div className="automation-overview">
        <h1>Automation settings</h1>
        <p>Configure scheduled syncs and cleanup routines to keep this mailbox under control.</p>
      </div>

      <div className="automation-content">
        <section className="automation-card">
          <header className="automation-card__header">
            <span className="automation-card__icon" aria-hidden>
              ⏰
            </span>
            <div>
              <h2 className="automation-card__title">Periodic sync</h2>
              <p className="automation-card__subtitle">Keep this mailbox fresh by syncing on a schedule.</p>
            </div>
          </header>

          <div className="automation-card__body">
            <label className="automation-field">
              <span>Interval</span>
              <select
                value={periodicMinutes}
                onChange={(event) => onPeriodicMinutesChange(Number(event.target.value) || 0)}
              >
                {periodicOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>Set to "Disabled" to turn off periodic syncing.</small>
            </label>

            <ButtonComponent
              cssClass="primary"
              content={isSavingPeriodic ? "Saving…" : periodicMinutes > 0 ? "Enable" : "Disable"}
              disabled={isSavingPeriodic}
              onClick={() => {
                void onSavePeriodicSync();
              }}
            />
          </div>
        </section>

        <section className="automation-card">
          <header className="automation-card__header">
            <span className="automation-card__icon" aria-hidden>
              🚫
            </span>
            <div>
              <h2 className="automation-card__title">Blocked sender filter</h2>
              <p className="automation-card__subtitle">Move messages from blocked senders into a safer folder.</p>
            </div>
          </header>

          <div className="automation-card__body">
            <label className="automation-field">
              <span>Target folder</span>
              <input
                type="text"
                value={blockFolder}
                placeholder="Blocked"
                onChange={(event) => onBlockFolderChange(event.target.value)}
              />
              <small>Leave blank to use the provider's default blocked folder.</small>
            </label>

            <ButtonComponent
              cssClass="ghost-button"
              content={isApplyingBlockFilter ? "Applying…" : "Apply filter"}
              disabled={isApplyingBlockFilter}
              onClick={() => {
                void onApplyBlockFilter();
              }}
            />
          </div>
        </section>

        <section className="automation-card">
          <header className="automation-card__header">
            <span className="automation-card__icon" aria-hidden>
              🗂️
            </span>
            <div>
              <h2 className="automation-card__title">Manual sync tools</h2>
              <p className="automation-card__subtitle">Kick off a full sync when you need a comprehensive refresh.</p>
            </div>
          </header>

          <div className="automation-card__body">
            <div className="automation-card__stat">
              <span className="automation-card__stat-label">Last full sync</span>
              <span className="automation-card__stat-value">
                {syncReport ? `${syncReport.fetched.toLocaleString()} fetched` : "No sync yet"}
              </span>
              <span className="automation-card__stat-meta">
                {syncReport
                  ? `${syncReport.stored.toLocaleString()} stored • ${(syncReport.duration_ms / 1000).toFixed(1)}s`
                  : "Run a full sync to generate a report."}
              </span>
            </div>
            <p className="automation-card__hint">
              Use the full sync action in the banner above to trigger a comprehensive refresh.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}