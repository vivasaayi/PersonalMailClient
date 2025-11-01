import { useAppState } from "../hooks/useAppState";
import Mailbox from "./Mailbox";
import AutomationView from "./AutomationView";
import LlmAssistantView from "./LlmAssistantView";
import AccountsView from "./AccountsView";
import SettingsView from "./SettingsView";
import RemoteDeleteMonitor from "./RemoteDeleteMonitor";
import BlockedSendersView from "./BlockedSendersView";
import BlockedDomainsView from "./BlockedDomainsView";
import DeletedEmailsView from "./DeletedEmailsView";
import WelcomeView from "./WelcomeView";
import type { SenderGroup, RemoteDeleteOverrideMode } from "../types";

interface MailboxData {
  emails: ReturnType<typeof useAppState>["currentEmails"];
  senderGroups: SenderGroup[];
  messageCount: number;
}

interface BulkUI {
  activeTagFilter: string[];
  onClearTagFilter: () => void;
  onOpenBulkPanel: () => void;
  filteredMessageCount: number;
}

interface ViewRouterProps {
  appState: ReturnType<typeof useAppState>;
  periodicMinutes: number;
  mailboxData: MailboxData;
  bulkUI: BulkUI;
  onConnectAccount: () => void;
  onOpenSavedAccounts: () => void;
}

function ViewRouter({
  appState,
  periodicMinutes,
  mailboxData,
  bulkUI,
  onConnectAccount,
  onOpenSavedAccounts
}: ViewRouterProps) {
  const { currentView, selectedAccount } = appState;

  if ((currentView === "webmail" || currentView === "pivot") && selectedAccount) {
    return (
      <Mailbox
        viewType={currentView as "webmail" | "pivot"}
        selectedAccount={selectedAccount}
        accounts={appState.accounts}
        emails={mailboxData.emails}
        senderGroups={mailboxData.senderGroups}
        totalCachedCount={appState.totalCachedCount}
        syncReport={appState.syncReport}
        syncProgress={appState.syncProgress}
        onRefreshEmails={appState.handleRefreshEmails}
        onFullSync={appState.handleFullSync}
        onWindowSync={appState.handleWindowSync}
        isSyncing={appState.isSyncing}
        isRefreshing={appState.refreshingAccount === selectedAccount}
        expandedSenderForAccount={appState.expandedSenders[selectedAccount] || null}
        onToggleExpansion={appState.toggleSenderExpansion}
        onStatusChange={appState.handleSenderStatusChange}
        statusUpdating={appState.statusUpdating}
        onDeleteMessage={appState.handleDeleteMessage}
        pendingDeleteUid={appState.pendingDeleteUid}
        hasMoreEmails={appState.hasMoreEmails}
        onLoadMoreEmails={appState.handleLoadMoreEmails}
        isLoadingMoreEmails={appState.isLoadingMoreEmails}
        activeTagFilter={bulkUI.activeTagFilter}
        onClearTagFilter={bulkUI.onClearTagFilter}
        onOpenBulkPanel={bulkUI.onOpenBulkPanel}
        filteredMessageCount={bulkUI.filteredMessageCount}
      />
    );
  }

  if (currentView === "automation" && selectedAccount) {
    return (
      <AutomationView
        account={appState.selectedAccountEntity}
        email={selectedAccount}
        periodicMinutes={periodicMinutes}
        onPeriodicMinutesChange={appState.handlePeriodicMinutesChange}
        onSavePeriodicSync={appState.handleSavePeriodicSync}
        isSavingPeriodic={appState.isSavingPeriodic}
        blockFolder={appState.blockFolder}
        onBlockFolderChange={appState.setBlockFolder}
        onApplyBlockFilter={appState.handleApplyBlockFilter}
        isApplyingBlockFilter={appState.isApplyingBlockFilter}
        syncReport={appState.syncReport}
        syncProgress={appState.syncProgress}
        onFullSync={appState.handleFullSync}
        isSyncing={appState.isSyncing}
        isRefreshing={appState.refreshingAccount === selectedAccount}
        emailsCount={appState.currentEmails.length}
        totalKnownMessages={appState.totalCachedCount}
      />
    );
  }

  if (currentView === "assistant") {
    return <LlmAssistantView />;
  }

  if (currentView === "accounts") {
    return (
      <AccountsView
        accounts={appState.accounts}
        savedAccounts={appState.savedAccounts}
        runtimeByEmail={appState.runtimeByEmail}
        selectedAccount={selectedAccount}
        activeAccount={appState.selectedAccountEntity}
        statusPills={appState.selectedAccountStatusPills}
        syncReport={appState.syncReport}
        syncProgress={appState.syncProgress}
        isSyncing={appState.isSyncing}
        isRefreshing={appState.refreshingAccount === selectedAccount}
        emailsCount={appState.currentEmails.length}
        totalKnownMessages={appState.totalCachedCount}
        onAddAccount={onConnectAccount}
        onSelectAccount={(email: string) => {
          appState.handleAccountSelect(email);
        }}
        onConnectSaved={appState.handleConnectSavedAccount}
        onRemoveAccount={appState.handleRemoveAccount}
        connectingSavedEmail={appState.connectingSavedEmail}
      />
    );
  }

  if (currentView === "settings") {
    return <SettingsView />;
  }

  if (currentView === "remote-delete" && selectedAccount) {
    const normalized = selectedAccount.trim().toLowerCase();
    const metrics = appState.remoteDeleteMetricsByAccount[normalized] ?? null;
    const loading = appState.remoteDeleteMetricsLoading[normalized] ?? false;
    const progress = appState.remoteDeleteProgressByAccount[normalized] ?? null;

    return (
      <RemoteDeleteMonitor
        accountEmail={selectedAccount}
        metrics={metrics}
        loading={loading}
        progress={progress}
        onRefresh={async () => {
          await appState.fetchRemoteDeleteMetrics(selectedAccount, { force: true });
        }}
        onChangeOverride={async (mode: RemoteDeleteOverrideMode) => {
          await appState.updateRemoteDeleteOverride(selectedAccount, mode);
        }}
      />
    );
  }

  if (currentView === "sync" && selectedAccount) {
    return (
      <div style={{ padding: "24px" }}>
        <h2 style={{ marginBottom: "16px" }}>
          Sync Settings for {selectedAccount}
        </h2>
        <p style={{ color: "#6b7280" }}>
          Sync configuration will be implemented here.
        </p>
      </div>
    );
  }

  if (currentView === "blocked" && selectedAccount) {
    return (
      <BlockedSendersView
        senderGroups={appState.currentSenderGroups}
        accountEmail={selectedAccount}
        onStatusChange={appState.handleSenderStatusChange}
        statusUpdating={appState.statusUpdating}
        onRefresh={appState.handleRefreshEmails}
        onDeleteMessage={appState.handleDeleteMessage}
        onPurgeSender={appState.handlePurgeSenderMessages}
        hasSenderData={appState.currentSenderGroups.length > 0}
      />
    );
  }

  if (currentView === "blocked-domains" && selectedAccount) {
    return (
      <BlockedDomainsView
        senderGroups={appState.currentSenderGroups}
        accountEmail={selectedAccount}
        onStatusChange={appState.handleSenderStatusChange}
        statusUpdating={appState.statusUpdating}
        onRefresh={appState.handleRefreshEmails}
        onDeleteMessage={appState.handleDeleteMessage}
        onPurgeSender={appState.handlePurgeSenderMessages}
        hasSenderData={appState.currentSenderGroups.length > 0}
      />
    );
  }

  if (currentView === "deleted" && selectedAccount) {
    return (
      <DeletedEmailsView
        accountEmail={selectedAccount}
        emails={appState.currentDeletedEmails}
        onRestore={appState.handleRestoreDeletedEmail}
        onPurge={appState.handlePurgeDeletedEmail}
        onRefresh={() => appState.loadDeletedEmails(selectedAccount).then(() => undefined)}
      />
    );
  }

  // Welcome view
  return (
    <WelcomeView
      onConnectAccount={onConnectAccount}
      onOpenSavedAccounts={onOpenSavedAccounts}
    />
  );
}

export default ViewRouter;