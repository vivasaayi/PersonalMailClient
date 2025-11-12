import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { useAppState } from "./hooks/useAppState";
import NavigationDrawer from "./components/NavigationDrawer";
import ConnectionWizard from "./components/ConnectionWizard";
import SavedAccountsDialog from "./components/SavedAccountsDialog";
import NotificationsHost from "./components/NotificationsHost";
import BulkAnalysisPanel from "./components/BulkAnalysisPanel";
import GlobalProgressBar from "./components/GlobalProgressBar";
import AppBar from "./components/AppBar";
import RemoteDeleteProgress from "./components/RemoteDeleteProgress";
import ViewRouter from "./components/ViewRouter";
import { useBulkAnalysis } from "./stores/bulkAnalysisStore";
import { useNotifications } from "./stores/notifications";
import type { SenderGroup } from "./types";

const SYNCFUSION_BANNER_OFFSET = 72;

export default function App() {
  const appState = useAppState();
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const {
    availableTags,
    currentRun,
    isPanelOpen,
    isStarting,
    lastError,
    lastRunTags,
    startAnalysis,
    setPanelOpen,
    togglePanel,
    activeTagFilter,
    toggleTagFilter,
    clearTagFilter,
    addKnownTags
  } = useBulkAnalysis();

  const periodicMinutes = appState.selectedAccount
    ? appState.periodicMinutesByAccount[appState.selectedAccount] ?? 0
    : 0;

  const assistantActive = appState.currentView === "assistant";
  const deleteMessage = appState.handleDeleteMessage;
  const [isDeletingFiltered, setIsDeletingFiltered] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const purgeProgress = appState.purgeProgress || null;
  
  const normalizedSelectedAccount = appState.selectedAccount
    ? appState.selectedAccount.trim().toLowerCase()
    : null;
  const remoteDeleteProgress = normalizedSelectedAccount
    ? appState.remoteDeleteProgressByAccount[normalizedSelectedAccount] ?? null
    : null;
  const remoteDeleteTotals = remoteDeleteProgress
    ? {
        total:
          remoteDeleteProgress.pending +
          remoteDeleteProgress.completed +
          remoteDeleteProgress.failed,
        pending: remoteDeleteProgress.pending,
        completed: remoteDeleteProgress.completed,
        failed: remoteDeleteProgress.failed
      }
    : null;
  const remoteDeletePercent = remoteDeleteTotals && remoteDeleteTotals.total > 0
    ? Math.min(
        100,
        ((remoteDeleteTotals.completed + remoteDeleteTotals.failed) /
          remoteDeleteTotals.total) *
          100
      )
    : 0;
  const remoteDeleteSummary = remoteDeleteTotals
    ? `${remoteDeleteTotals.completed} done · ${remoteDeleteTotals.pending} remaining` +
      (remoteDeleteTotals.failed > 0 ? ` · ${remoteDeleteTotals.failed} failed` : "")
    : "";
  const remoteDeleteGlobalProgress = remoteDeleteTotals
    ? {
        pending: remoteDeleteTotals.pending,
        completed: remoteDeleteTotals.completed,
        failed: remoteDeleteTotals.failed,
        total: remoteDeleteTotals.total,
        summary: remoteDeleteSummary
      }
    : null;

  const handleAssistantButtonClick = () => {
    if (assistantActive) {
      if (appState.selectedAccount) {
        appState.handleNavigate("webmail");
      } else {
        appState.handleNavigate("settings");
      }
      return;
    }

    appState.handleNavigate("assistant");
  };

  useEffect(() => {
    const collected = new Set<string>();
    appState.currentSenderGroups.forEach((group) => {
      group.messages.forEach((message) => {
        message.analysis_categories.forEach((tag) => {
          const trimmed = tag.trim();
          if (trimmed) {
            collected.add(trimmed);
          }
        });
      });
    });
    if (collected.size > 0) {
      addKnownTags(Array.from(collected));
    }
  }, [addKnownTags, appState.currentSenderGroups]);

  const mailboxData = useMemo<{
    senderGroups: SenderGroup[];
    emails: typeof appState.currentEmails;
    messageRefs: Array<{ senderEmail: string; uid: string }>;
    messageCount: number;
  }>(() => {
    const normalizedFilter = activeTagFilter
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);

    if (normalizedFilter.length === 0) {
      return {
        senderGroups: appState.currentSenderGroups,
        emails: appState.currentEmails,
        messageRefs: [] as Array<{ senderEmail: string; uid: string }>,
        messageCount: 0
      };
    }

    const filterSet = new Set(normalizedFilter);
    const filteredGroups: SenderGroup[] = [];
    const messageRefs: Array<{ senderEmail: string; uid: string }> = [];
    const includedUids = new Set<string>();

    appState.currentSenderGroups.forEach((group) => {
      const matchingMessages = group.messages.filter((message) =>
        message.analysis_categories.some((category) => filterSet.has(category.trim().toLowerCase()))
      );

      if (matchingMessages.length === 0) {
        return;
      }

      filteredGroups.push({
        ...group,
        message_count: matchingMessages.length,
        messages: matchingMessages
      });

      matchingMessages.forEach((message) => {
        if (!includedUids.has(message.uid)) {
          includedUids.add(message.uid);
          messageRefs.push({ senderEmail: group.sender_email, uid: message.uid });
        }
      });
    });

    const filteredEmails = appState.currentEmails.filter((email) => includedUids.has(email.uid));

    return {
      senderGroups: filteredGroups,
      emails: filteredEmails,
      messageRefs,
      messageCount: messageRefs.length
    };
  }, [activeTagFilter, appState.currentEmails, appState.currentSenderGroups]);

  const handleDeleteFiltered = useCallback(async () => {
    if (mailboxData.messageRefs.length === 0) {
      return;
    }

    const total = mailboxData.messageRefs.length;
    setIsDeletingFiltered(true);
    setDeleteProgress({ completed: 0, total, failed: 0 });
    let completed = 0;
    let failed = 0;

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      for (const item of mailboxData.messageRefs) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
          try {
            await deleteMessage(item.senderEmail, item.uid, { suppressNotifications: true });
            completed += 1;
            setDeleteProgress({ completed, total, failed });
            break; // Success, exit retry loop
          } catch (error) {
            console.error(`Failed to delete message ${item.uid} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
            
            if (retryCount < maxRetries) {
              // Exponential backoff: 1s, 2s, 4s
              const backoffDelay = Math.pow(2, retryCount) * 1000;
              await delay(backoffDelay);
              retryCount += 1;
            } else {
              // Max retries reached, mark as failed
              failed += 1;
              setDeleteProgress({ completed, total, failed });
              break;
            }
          }
        }

        // Add a small delay between deletions to respect rate limits
        if (completed + failed < total) {
          await delay(200); // 200ms delay between operations
        }
      }

      // Show final notification
      if (failed === 0) {
        notifySuccess(`Successfully deleted ${completed} messages.`);
      } else if (completed === 0) {
        notifyError(`Failed to delete any messages. Check logs for details.`);
      } else {
        notifyInfo(`Deleted ${completed} messages, ${failed} failed. Check logs for details.`);
      }
    } finally {
      setIsDeletingFiltered(false);
      setDeleteProgress(null);
    }
  }, [deleteMessage, mailboxData.messageRefs, notifySuccess, notifyError, notifyInfo]);

  const handleStartAnalysis = useCallback(
    async (options: { tags: string[]; maxTokens?: number; snippetLimit?: number; force?: boolean }) => {
      await startAnalysis(options);
    },
    [startAnalysis]
  );

  return (
    <div
      style={{
        display: "flex",
        height: `calc(100vh - ${SYNCFUSION_BANNER_OFFSET}px)`,
        marginTop: `${SYNCFUSION_BANNER_OFFSET}px`
      }}
    >
      {/* Navigation Drawer */}
      <NavigationDrawer
        open={appState.drawerOpen}
        accounts={appState.accounts}
        selectedAccount={appState.selectedAccount}
        runtimeByEmail={appState.runtimeByEmail}
        onAccountSelect={appState.handleAccountSelect}
        onNavigate={appState.handleNavigate}
        currentView={appState.currentView}
        onOpenSavedAccounts={appState.handleOpenSavedAccountsDialog}
        hasSavedAccounts={appState.savedAccounts.length > 0}
      />

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* App Bar */}
        <AppBar
          onDrawerToggle={appState.handleDrawerToggle}
          onBulkAnalysisToggle={() => {
            if (appState.accounts.length === 0) {
              return;
            }
            togglePanel();
          }}
          onAssistantToggle={handleAssistantButtonClick}
          hasAccounts={appState.accounts.length > 0}
          assistantActive={assistantActive}
          isPanelOpen={isPanelOpen}
        />

        {/* Remote Delete Progress */}
        {remoteDeleteTotals && remoteDeleteTotals.total > 0 && (
          <RemoteDeleteProgress
            totals={remoteDeleteTotals}
            percent={remoteDeletePercent}
            summary={remoteDeleteSummary}
          />
        )}

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            padding: 0
          }}
        >
          <ViewRouter
            appState={appState}
            periodicMinutes={periodicMinutes}
            mailboxData={mailboxData}
            bulkUI={{
              activeTagFilter,
              onClearTagFilter: clearTagFilter,
              onOpenBulkPanel: () => setPanelOpen(true),
              filteredMessageCount: mailboxData.messageCount
            }}
            onConnectAccount={appState.handleOpenConnectionWizard}
            onOpenSavedAccounts={appState.handleOpenSavedAccountsDialog}
          />
        </div>
      </main>

      {/* Floating Action Button */}
      <ButtonComponent
        cssClass="fab primary"
        content="+"
        onClick={appState.handleOpenConnectionWizard}
      />

      {/* Connection Wizard */}
      <ConnectionWizard
        open={appState.connectionWizardOpen}
        onClose={appState.handleCloseConnectionWizard}
        onConnected={appState.handleAccountConnected}
      />

      {/* Saved Accounts Dialog */}
      <SavedAccountsDialog
        open={appState.savedAccountsDialogOpen}
        onClose={appState.handleCloseSavedAccountsDialog}
        savedAccounts={appState.savedAccounts}
        onConnectSaved={appState.handleConnectSavedAccount}
        connectingSavedEmail={appState.connectingSavedEmail}
        onOpenConnectionWizard={appState.handleOpenConnectionWizard}
      />

      {/* Global Progress Bar */}
      <GlobalProgressBar
        deleteProgress={deleteProgress}
        purgeProgress={purgeProgress}
        remoteDeleteProgress={remoteDeleteGlobalProgress}
      />

      {/* Notifications */}
      <NotificationsHost />

      {/* Bulk Analysis Panel */}
      <BulkAnalysisPanel
        isOpen={isPanelOpen}
        onClose={() => setPanelOpen(false)}
        availableTags={availableTags}
        currentRun={currentRun}
        isStarting={isStarting}
        lastError={lastError}
        lastRunTags={lastRunTags}
        onStart={handleStartAnalysis}
        activeTagFilter={activeTagFilter}
        onToggleTagFilter={toggleTagFilter}
        onClearFilter={clearTagFilter}
        filteredMessageCount={mailboxData.messageCount}
        onDeleteFiltered={handleDeleteFiltered}
        isDeletingFiltered={isDeletingFiltered}
        deleteProgress={deleteProgress}
      />
    </div>
  );
}
