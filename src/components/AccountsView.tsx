import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { AccountStatusBanner } from "./AccountStatusBanner";
import { SyncSummary } from "./SyncSummary";
import type { StatusPill } from "../utils/mailboxStatus";
import type { Account, SavedAccount, SyncProgress, SyncReport } from "../types";
import type { AccountLifecycleStatus, AccountRuntimeState } from "../stores/accountsStore";

interface AccountsViewProps {
  accounts: Account[];
  savedAccounts: SavedAccount[];
  runtimeByEmail: Record<string, AccountRuntimeState>;
  selectedAccount: string | null;
  activeAccount: Account | null;
  statusPills: StatusPill[];
  syncReport: SyncReport | null;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  isRefreshing: boolean;
  emailsCount: number;
  totalKnownMessages: number;
  onAddAccount: () => void;
  onSelectAccount: (email: string) => void;
  onConnectSaved: (saved: SavedAccount) => Promise<void>;
  onRemoveAccount: (email: string) => Promise<void> | void;
  connectingSavedEmail: string | null;
}

const providerLabels: Record<Account["provider"], string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

const STATUS_APPEARANCE: Record<AccountLifecycleStatus, { label: string; background: string; color: string }> = {
  idle: { label: "Idle", background: "#ecfdf5", color: "#047857" },
  connecting: { label: "Connecting", background: "#eff6ff", color: "#1d4ed8" },
  syncing: { label: "Syncing", background: "#eef2ff", color: "#4338ca" },
  error: { label: "Needs Attention", background: "#fef2f2", color: "#b91c1c" }
};

function formatLastSync(timestamp: number | null): string {
  if (!timestamp) {
    return "Last sync: Never";
  }
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60_000) {
    return "Last sync: Just now";
  }
  if (diff < 3_600_000) {
    const minutes = Math.round(diff / 60_000);
    return `Last sync: ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.round(diff / 3_600_000);
    return `Last sync: ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  return `Last sync: ${new Date(timestamp).toLocaleString()}`;
}

function AccountCard({
  account,
  isActive,
  hasSavedCredentials,
  onOpenMailbox,
  onReconnect,
  onRemove,
  isConnecting,
  runtime
}: {
  account: Account;
  isActive: boolean;
  hasSavedCredentials: boolean;
  onOpenMailbox: () => void;
  onReconnect: () => void;
  onRemove: () => void;
  isConnecting: boolean;
  runtime?: AccountRuntimeState;
}) {
  const status = runtime?.status ?? "idle";
  const appearance = STATUS_APPEARANCE[status];
  const lastSyncLabel = formatLastSync(runtime?.lastSync ?? null);

  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        backgroundColor: isActive ? "#f5f9ff" : "#ffffff",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        boxShadow: isActive ? "0 10px 30px -20px rgba(37,99,235,0.5)" : "0 6px 20px -18px rgba(15,23,42,0.2)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px" }}>{account.email}</div>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>{providerLabels[account.provider]}</div>
        </div>
        {isActive && (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "9999px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: 600
            }}
          >
            Active
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "9999px",
            backgroundColor: appearance.background,
            color: appearance.color,
            fontSize: "12px",
            fontWeight: 600
          }}
        >
          {appearance.label}
        </span>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>{lastSyncLabel}</span>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ButtonComponent cssClass="e-outline" onClick={onOpenMailbox}>
          Open Mailbox
        </ButtonComponent>
        <ButtonComponent
          cssClass="e-outline"
          disabled={!hasSavedCredentials || isConnecting}
          onClick={onReconnect}
        >
          {isConnecting ? (runtime?.status === "syncing" ? "Syncing…" : "Testing…") : "Test Connection"}
        </ButtonComponent>
        <ButtonComponent cssClass="e-danger" onClick={onRemove}>
          Remove
        </ButtonComponent>
      </div>
    </div>
  );
}

function SavedAccountCard({
  saved,
  isConnecting,
  onConnect
}: {
  saved: SavedAccount;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={isConnecting}
      style={{
        width: "100%",
        padding: "16px",
        borderRadius: "8px",
        border: "1px solid #d1d5db",
        backgroundColor: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: isConnecting ? "not-allowed" : "pointer",
        transition: "box-shadow 0.2s ease",
        boxShadow: isConnecting ? "none" : "0 10px 30px -24px rgba(37,99,235,0.45)"
      }}
    >
      <div style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 600 }}>{saved.email}</div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          {providerLabels[saved.provider]} · {saved.has_password ? "Password stored" : "Password required"}
        </div>
      </div>
      <span style={{ fontSize: "13px", color: "#2563eb" }}>
        {isConnecting ? "Connecting…" : "Connect"}
      </span>
    </button>
  );
}

export default function AccountsView({
  accounts,
  savedAccounts,
  runtimeByEmail,
  selectedAccount,
  activeAccount,
  statusPills,
  syncReport,
  syncProgress,
  isSyncing,
  isRefreshing,
  emailsCount,
  totalKnownMessages,
  onAddAccount,
  onSelectAccount,
  onConnectSaved,
  onRemoveAccount,
  connectingSavedEmail
}: AccountsViewProps) {
  const savedAccountsByEmail = new Map(savedAccounts.map((saved) => [saved.email, saved]));
  const disconnectedSaved = savedAccounts.filter((saved) => !accounts.some((acct) => acct.email === saved.email));
  const bannerAccount = activeAccount ?? (selectedAccount ? accounts.find((acct) => acct.email === selectedAccount) ?? null : null);
  const bannerEmail = bannerAccount?.email ?? selectedAccount;

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "28px" }}>
      {bannerEmail && (
        <AccountStatusBanner
          account={bannerAccount ?? undefined}
          email={bannerEmail}
          statusPills={statusPills}
        />
      )}

      {bannerEmail && (
        <SyncSummary
          emailsCount={emailsCount}
          totalKnownMessages={totalKnownMessages}
          syncReport={syncReport}
          syncProgress={syncProgress}
          isSyncing={isSyncing || isRefreshing}
        />
      )}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px" }}>Accounts</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
            Manage connected accounts, test credentials, and switch mailboxes quickly.
          </p>
        </div>
        <ButtonComponent cssClass="e-primary" onClick={onAddAccount}>
          + Add Account
        </ButtonComponent>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Connected Accounts</h2>
        {accounts.length === 0 ? (
          <div style={{ padding: "20px", borderRadius: "12px", border: "1px dashed #d1d5db", color: "#6b7280" }}>
            No accounts connected yet. Add an account to start managing your mailbox.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            {accounts.map((account) => {
              const saved = savedAccountsByEmail.get(account.email);
              const normalizedEmail = account.email.trim().toLowerCase();
              const runtime = runtimeByEmail[normalizedEmail];
              const isBusy = Boolean(
                runtime && (runtime.status === "connecting" || runtime.status === "syncing")
              );
              return (
                <AccountCard
                  key={account.email}
                  account={account}
                  isActive={selectedAccount === account.email}
                  hasSavedCredentials={Boolean(saved?.has_password)}
                  isConnecting={connectingSavedEmail === account.email || isBusy}
                  onOpenMailbox={() => onSelectAccount(account.email)}
                  onReconnect={() => {
                    if (saved) {
                      void onConnectSaved(saved);
                    }
                  }}
                  onRemove={() => {
                    void onRemoveAccount(account.email);
                  }}
                  runtime={runtime}
                />
              );
            })}
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Saved Accounts</h2>
          {disconnectedSaved.length > 0 && (
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              {disconnectedSaved.length} ready to connect
            </span>
          )}
        </div>
        {savedAccounts.length === 0 ? (
          <div style={{ padding: "18px", borderRadius: "8px", border: "1px dashed #d1d5db", color: "#9ca3af" }}>
            No saved accounts yet. Connect a new account and it will appear here for quick access.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {savedAccounts.map((saved) => (
              <SavedAccountCard
                key={saved.email}
                saved={saved}
                isConnecting={connectingSavedEmail === saved.email}
                onConnect={() => {
                  void onConnectSaved(saved);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
