import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import type {
  ConnectAccountResponse,
  SavedAccount,
  Provider,
  SenderStatus,
  DeletedEmail,
  RemoteDeleteStatusPayload,
  RemoteDeleteUpdate
} from "../types";
import { useAccountsStore } from "../stores/accountsStore";
import type { AccountLifecycleStatus } from "../stores/accountsStore";
import { useNotifications } from "../stores/notifications";
import { useEmailState } from "./useEmailState";
import { useSyncOperations } from "./useSyncOperations";
import { useUIState } from "./useUIState";
import { useAutomationState } from "./useAutomationState";
import { buildSyncStatusPills } from "../utils/mailboxStatus";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

type RemoteDeleteCounters = {
  pending: number;
  completed: number;
  failed: number;
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const MIN_CACHE_FETCH = 1_000;
const MAX_CACHE_FETCH = 50_000;
const LOAD_MORE_CHUNK = 500;

export function useAppState() {
  const {
    accounts,
    savedAccounts,
    connectingSavedEmail,
    runtimeByEmail,
    setAccountStatus: setAccountStatusAction,
    setAccountLastSync,
    refreshSavedAccounts,
    connectSavedAccount: connectSavedAccountAction,
    disconnectAccount: disconnectAccountAction,
    upsertAccount
  } = useAccountsStore();
  
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const emailListRef = useRef<HTMLElement>(null);

  // Custom hooks for different state domains
  const emailState = useEmailState();
  const uiState = useUIState(accounts);
  const deletedEmailsRef = useRef<Record<string, DeletedEmail[]>>({});

  useEffect(() => {
    deletedEmailsRef.current = emailState.deletedEmailsByAccount;
  }, [emailState.deletedEmailsByAccount]);

  const remoteDeletePendingRef = useRef<Record<string, Set<string>>>({});
  const [remoteDeleteProgressMap, setRemoteDeleteProgressMap] = useState<
    Record<string, RemoteDeleteCounters>
  >({});

  const registerRemoteDeletes = useCallback((accountEmail: string, uids: string[]) => {
    if (uids.length === 0) return;
    const normalized = accountEmail.trim().toLowerCase();

    setRemoteDeleteProgressMap((prev) => {
      const existingSet = new Set(remoteDeletePendingRef.current[normalized] ?? []);
      let added = 0;
      for (const uid of uids) {
        if (!existingSet.has(uid)) {
          existingSet.add(uid);
          added += 1;
        }
      }

      if (added === 0) {
        return prev;
      }

      remoteDeletePendingRef.current[normalized] = existingSet;
      const previous = prev[normalized];
      const resetCycle = !previous || previous.pending === 0;
      const nextEntry: RemoteDeleteCounters = resetCycle
        ? { pending: existingSet.size, completed: 0, failed: 0 }
        : { pending: existingSet.size, completed: previous.completed, failed: previous.failed };

      return {
        ...prev,
        [normalized]: nextEntry
      };
    });
  }, []);

  const applyRemoteDeleteUpdates = useCallback(
    (accountEmail: string, updates: RemoteDeleteUpdate[]) => {
      if (updates.length === 0) return;
      const normalized = accountEmail.trim().toLowerCase();

      setRemoteDeleteProgressMap((prev) => {
        const existingSet = new Set(remoteDeletePendingRef.current[normalized] ?? []);
        let completedInc = 0;
        let failedInc = 0;

        for (const update of updates) {
          if (existingSet.has(update.uid)) {
            existingSet.delete(update.uid);
            completedInc += 1;
            if (update.remote_error && update.remote_error.length > 0) {
              failedInc += 1;
            }
          }
        }

        remoteDeletePendingRef.current[normalized] = existingSet;

        if (completedInc === 0 && failedInc === 0 && !prev[normalized]) {
          return prev;
        }

        const previous = prev[normalized] ?? {
          pending: existingSet.size + completedInc,
          completed: 0,
          failed: 0
        };

        const nextPending = existingSet.size;
        const nextCounters: RemoteDeleteCounters = {
          pending: nextPending,
          completed: previous.completed + completedInc,
          failed: previous.failed + failedInc
        };

        if (nextPending === 0) {
          if (!prev[normalized]) {
            return prev;
          }
          const nextMap = { ...prev };
          delete nextMap[normalized];
          return nextMap;
        }

        return {
          ...prev,
          [normalized]: nextCounters
        };
      });
    },
    []
  );
  
  const syncOps = useSyncOperations({
    accounts,
    loadCachedEmails: emailState.loadCachedEmails,
    loadSenderGroups: emailState.loadSenderGroups,
    loadCachedCount: emailState.loadCachedCount,
    loadDeletedEmails: emailState.loadDeletedEmails,
    maxCachedItemsByAccount: emailState.maxCachedItemsByAccount,
    updateSenderStatus: emailState.updateSenderStatus,
    deleteMessageFromGroups: emailState.deleteMessageFromGroups,
    addDeletedEmail: emailState.addDeletedEmail,
    setAccountStatus: (email: string, status: AccountLifecycleStatus) =>
      setAccountStatusAction(email, status),
    setAccountLastSync,
    registerRemoteDeletes
  });

  const automationState = useAutomationState();
  const [loadingMoreEmails, setLoadingMoreEmails] = useState(false);

  // Derived state
  const currentEmails = useMemo(() => {
    if (!uiState.selectedAccount) return [];
    return emailState.emailsByAccount[uiState.selectedAccount] ?? [];
  }, [emailState.emailsByAccount, uiState.selectedAccount]);

  const currentSenderGroups = useMemo(() => {
    if (!uiState.selectedAccount) return [];
    return emailState.senderGroupsByAccount[uiState.selectedAccount] ?? [];
  }, [uiState.selectedAccount, emailState.senderGroupsByAccount]);

  const currentDeletedEmails = useMemo(() => {
    if (!uiState.selectedAccount) return [];
    return emailState.deletedEmailsByAccount[uiState.selectedAccount] ?? [];
  }, [uiState.selectedAccount, emailState.deletedEmailsByAccount]);

  const selectedAccountEntity = useMemo(() => {
    if (!uiState.selectedAccount) return null;
    return accounts.find((acct) => acct.email === uiState.selectedAccount) ?? null;
  }, [uiState.selectedAccount, accounts]);

  const totalCachedCount = useMemo(() => {
    if (!uiState.selectedAccount) return currentEmails.length;
    return emailState.cachedCountsByAccount[uiState.selectedAccount] ?? currentEmails.length;
  }, [uiState.selectedAccount, emailState.cachedCountsByAccount, currentEmails.length]);

  const hasMoreEmails = useMemo(() => {
    if (!uiState.selectedAccount) return false;
    return currentEmails.length < totalCachedCount;
  }, [uiState.selectedAccount, currentEmails.length, totalCachedCount]);

  const syncReport = useMemo(() => {
    if (!uiState.selectedAccount) return null;
    return syncOps.syncReports[uiState.selectedAccount] ?? null;
  }, [uiState.selectedAccount, syncOps.syncReports]);

  const syncProgress = useMemo(() => {
    if (!uiState.selectedAccount) return null;
    return syncOps.syncProgressByAccount[uiState.selectedAccount] ?? null;
  }, [uiState.selectedAccount, syncOps.syncProgressByAccount]);

  const selectedAccountStatusPills = useMemo(() => {
    if (!uiState.selectedAccount) return [];
    return buildSyncStatusPills({
      isSyncing: syncOps.isSyncing,
      isRefreshing: syncOps.refreshingAccount === uiState.selectedAccount,
      syncReport,
      syncProgress,
      emailsCount: currentEmails.length,
      totalKnownMessages: totalCachedCount
    });
  }, [
    uiState.selectedAccount,
    syncOps.isSyncing,
    syncOps.refreshingAccount,
    syncReport,
    syncProgress,
    currentEmails.length,
    totalCachedCount
  ]);

  // Load saved accounts on mount
  const loadSavedAccounts = useCallback(async () => {
    try {
      await refreshSavedAccounts();
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    }
  }, [refreshSavedAccounts, notifyError]);

  useEffect(() => {
    loadSavedAccounts().catch((err) => {
      console.error("Failed to load saved accounts", err);
    });
  }, [loadSavedAccounts]);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    listen<RemoteDeleteStatusPayload>("remote-delete-status", (event) => {
      if (!event.payload) return;
      const payload = event.payload;
      emailState.updateDeletedEmailStatus(payload.account_email, payload.updates);
      applyRemoteDeleteUpdates(payload.account_email, payload.updates);

      const existing = deletedEmailsRef.current[payload.account_email] ?? [];
      for (const update of payload.updates) {
        const target = existing.find((item) => item.uid === update.uid);
        const subject = target?.subject?.trim() ? target.subject : "(No subject)";

        if (typeof update.remote_error === "string" && update.remote_error) {
          notifyError(`Remote delete failed for "${subject}": ${update.remote_error}`);
        }
      }
    })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch((err) => {
        console.error("Failed to register remote delete listener", err);
      });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [emailState.updateDeletedEmailStatus, applyRemoteDeleteUpdates, notifyError]);

  // Apply connect response
  const applyConnectResponse = useCallback(
    async (payload: ConnectAccountResponse) => {
      upsertAccount(payload.account);

      emailState.setEmailsByAccount((prev) => ({
        ...prev,
        [payload.account.email]: payload.emails
      }));
      
      emailState.maxCachedItemsByAccount.current[payload.account.email] = Math.max(
        payload.emails.length,
        MIN_CACHE_FETCH
      );

      await emailState.loadSenderGroups(payload.account.email);
      await emailState.loadCachedCount(payload.account.email);

      uiState.setSelectedAccount(payload.account.email);
      uiState.handleNavigate("mailbox");
    },
    [emailState, uiState, upsertAccount]
  );

  const handleAccountConnected = useCallback(
    async ({
      response,
      source
    }: {
      response: ConnectAccountResponse;
      source: "new" | "saved";
      savedAccount?: SavedAccount;
    }) => {
      await applyConnectResponse(response);
      if (source === "saved") {
        notifySuccess(
          `Reconnected ${response.account.email} using saved macOS keychain credentials.`
        );
      } else {
        notifySuccess(
          `Connected to ${providerLabels[response.account.provider]} as ${response.account.email}`
        );
      }
    },
    [applyConnectResponse, notifySuccess]
  );

  const handleConnectSavedAccount = useCallback(
    async (saved: SavedAccount) => {
      try {
        const payload = await connectSavedAccountAction(saved);
        await handleAccountConnected({
          response: payload,
          source: "saved",
          savedAccount: saved
        });
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [connectSavedAccountAction, handleAccountConnected, notifyError]
  );

  const handleRemoveAccount = useCallback(
    async (email: string) => {
      try {
        await disconnectAccountAction(email);
        emailState.clearAccountData(email);
        syncOps.clearSyncData(email);
        automationState.clearAutomationData(email);

        const normalized = email.trim().toLowerCase();
        delete remoteDeletePendingRef.current[normalized];
        setRemoteDeleteProgressMap((prev) => {
          if (!prev[normalized]) {
            return prev;
          }
          const next = { ...prev };
          delete next[normalized];
          return next;
        });

        if (uiState.selectedAccount === email) {
          uiState.setSelectedAccount(null);
          uiState.handleNavigate("accounts");
        }
        notifyInfo(`Disconnected and removed ${email}.`);
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [
      disconnectAccountAction,
      emailState,
      syncOps,
      automationState,
      uiState,
      notifyError,
      notifyInfo
    ]
  );

  // Periodic polling for emails every 30 seconds
  useEffect(() => {
    if (!uiState.selectedAccount) return;

    const interval = setInterval(() => {
      const periodicLimit = Math.max(
        emailState.maxCachedItemsByAccount.current[uiState.selectedAccount!] ?? 0,
        MIN_CACHE_FETCH
      );
      syncOps.refreshEmailsForAccount(uiState.selectedAccount!, periodicLimit, false).catch((err) => {
        console.error("Failed to run incremental sync during periodic poll", err);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [uiState.selectedAccount, syncOps, emailState.maxCachedItemsByAccount]);

  // Bootstrap account on selection
  useEffect(() => {
    if (!uiState.selectedAccount) return;

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const count = await emailState.loadCachedCount(uiState.selectedAccount!);
        if (cancelled) return;
        
        const cappedTotal = count ? Math.min(count, MAX_CACHE_FETCH) : 0;
        const initialFetchLimit = Math.max(
          cappedTotal,
          emailState.maxCachedItemsByAccount.current[uiState.selectedAccount!] ?? 0,
          2000,
          MIN_CACHE_FETCH
        );

        await emailState.loadCachedEmails(uiState.selectedAccount!, initialFetchLimit);
        if (cancelled) return;
        
        await emailState.loadSenderGroups(uiState.selectedAccount!);
        if (cancelled) return;

        await emailState.loadDeletedEmails(uiState.selectedAccount!);
        if (cancelled) return;
        
        await syncOps.refreshEmailsForAccount(uiState.selectedAccount!, initialFetchLimit, false);
      } catch (err) {
        console.error("Failed to bootstrap account cache", err);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [uiState.selectedAccount, emailState, syncOps]);

  useEffect(() => {
    setLoadingMoreEmails(false);
  }, [uiState.selectedAccount]);

  const handleLoadMoreEmails = useCallback(async () => {
    if (!uiState.selectedAccount) return;
    if (loadingMoreEmails) return;
    if (!hasMoreEmails) return;

    const accountEmail = uiState.selectedAccount;
    setLoadingMoreEmails(true);

    try {
      const nextLimit = Math.min(
        MAX_CACHE_FETCH,
        totalCachedCount,
        currentEmails.length + LOAD_MORE_CHUNK
      );

      if (nextLimit <= currentEmails.length) {
        return;
      }

      await emailState.loadCachedEmails(accountEmail, nextLimit);
    } catch (err) {
      console.error("Failed to load more cached emails", err);
    } finally {
      setLoadingMoreEmails(false);
    }
  }, [uiState.selectedAccount, loadingMoreEmails, hasMoreEmails, totalCachedCount, currentEmails.length, emailState.loadCachedEmails]);

  const handleRestoreDeletedEmail = useCallback(
    async (uid: string) => {
      if (!uiState.selectedAccount) return;
      const accountEmail = uiState.selectedAccount;

      try {
        await invoke<DeletedEmail>("restore_deleted_message", {
          email: accountEmail,
          uid
        });

        await emailState.loadDeletedEmails(accountEmail);
        await emailState.loadCachedEmails(accountEmail);
        await emailState.loadSenderGroups(accountEmail);
        await emailState.loadCachedCount(accountEmail);

        notifySuccess("Message restored to local cache.");
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [
      uiState.selectedAccount,
      emailState.loadDeletedEmails,
      emailState.loadCachedEmails,
      emailState.loadSenderGroups,
      emailState.loadCachedCount,
      notifyError,
      notifySuccess
    ]
  );

  const handlePurgeDeletedEmail = useCallback(
    async (uid: string) => {
      if (!uiState.selectedAccount) return;
      const accountEmail = uiState.selectedAccount;

      try {
        const removed = await invoke<boolean>("purge_deleted_message", {
          email: accountEmail,
          uid
        });

        await emailState.loadDeletedEmails(accountEmail);

        if (removed) {
          notifySuccess("Message removed from deleted archive.");
        } else {
          notifyInfo("Message already removed from archive.");
        }
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [
      uiState.selectedAccount,
      emailState.loadDeletedEmails,
      notifyError,
      notifyInfo,
      notifySuccess
    ]
  );

  const handlePurgeSenderMessages = useCallback(
    async (senderEmail: string) => {
      if (!uiState.selectedAccount) return;
      const accountEmail = uiState.selectedAccount;
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) {
        notifyError("Account is not connected.");
        return;
      }

      const trimmedSender = senderEmail.trim();
      if (!trimmedSender) {
        notifyInfo("Select a sender to purge.");
        return;
      }

      try {
        const archived = await invoke<DeletedEmail[]>("purge_sender_messages", {
          provider: account.provider,
          email: account.email,
          senderEmail: trimmedSender
        });

        if (!archived.length) {
          notifyInfo("No cached messages found for that sender.");
          return;
        }

        const normalizedSender = trimmedSender.toLowerCase();
        const uids = archived.map((entry) => entry.uid);

        archived.forEach((entry) => {
          const senderKey = entry.sender_email?.trim() || normalizedSender;
          emailState.deleteMessageFromGroups(account.email, senderKey, entry.uid);
          emailState.addDeletedEmail(account.email, entry);
        });

        if (uids.length > 0) {
          registerRemoteDeletes(account.email, uids);
        }

        await Promise.all([
          emailState.loadSenderGroups(account.email),
          emailState.loadCachedEmails(account.email),
          emailState.loadCachedCount(account.email),
          emailState.loadDeletedEmails(account.email)
        ]);

        notifySuccess(
          `Queued ${uids.length} message${uids.length === 1 ? "" : "s"} from ${trimmedSender} for remote deletion.`
        );
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [
      accounts,
      emailState.addDeletedEmail,
      emailState.deleteMessageFromGroups,
      emailState.loadCachedCount,
      emailState.loadCachedEmails,
      emailState.loadDeletedEmails,
      emailState.loadSenderGroups,
      notifyError,
      notifyInfo,
      notifySuccess,
      registerRemoteDeletes,
      uiState.selectedAccount
    ]
  );

  return {
    // Account state
    accounts,
    savedAccounts,
    connectingSavedEmail,
    runtimeByEmail,
    selectedAccountEntity,
    
    // Email state
    currentEmails,
    currentSenderGroups,
    currentDeletedEmails,
    totalCachedCount,
    expandedSenders: emailState.expandedSenders,
    deletedEmailsByAccount: emailState.deletedEmailsByAccount,
    
    // Sync state
    syncReport,
    syncProgress,
    isSyncing: syncOps.isSyncing,
    refreshingAccount: syncOps.refreshingAccount,
    statusUpdating: syncOps.statusUpdating,
    pendingDeleteUid: syncOps.pendingDeleteUid,
    remoteDeleteProgressByAccount: remoteDeleteProgressMap,
    selectedAccountStatusPills,
    hasMoreEmails,
    isLoadingMoreEmails: loadingMoreEmails,
    
    // Automation state
    ...automationState,
    
    // UI state
    ...uiState,
    
    // Refs
    emailListRef,
    
    // Handlers
    handleAccountConnected,
    handleConnectSavedAccount,
    handleRemoveAccount,
    loadSavedAccounts,
    toggleSenderExpansion: (senderEmail: string) => {
      if (uiState.selectedAccount) {
        emailState.toggleSenderExpansion(uiState.selectedAccount, senderEmail);
      }
    },
    
    // Sync handlers
    handleRefreshEmails: async () => {
      if (uiState.selectedAccount) {
        await syncOps.handleRefreshEmails(uiState.selectedAccount);
      }
    },
    handleFullSync: async () => {
      if (uiState.selectedAccount) {
        await syncOps.handleFullSync(uiState.selectedAccount);
      }
    },
    handleSenderStatusChange: async (senderEmail: string, status: SenderStatus) => {
      if (uiState.selectedAccount) {
        await syncOps.handleSenderStatusChange(uiState.selectedAccount, senderEmail, status);
      }
    },
    handleDeleteMessage: async (senderEmail: string, uid: string) => {
      if (uiState.selectedAccount) {
        await syncOps.handleDeleteMessage(uiState.selectedAccount, senderEmail, uid);
      }
    },
    handlePurgeSenderMessages,
    handleLoadMoreEmails,
    
    // Automation handlers
    handlePeriodicMinutesChange: (value: number) => {
      if (uiState.selectedAccount) {
        automationState.handlePeriodicMinutesChange(uiState.selectedAccount, value);
      }
    },
    handleSavePeriodicSync: async () => {
      if (uiState.selectedAccount) {
        await automationState.handleSavePeriodicSync(
          uiState.selectedAccount,
          accounts,
          selectedAccountEntity
        );
      }
    },
    handleApplyBlockFilter: async () => {
      if (uiState.selectedAccount) {
        await automationState.handleApplyBlockFilter(
          uiState.selectedAccount,
          accounts,
          selectedAccountEntity,
          syncOps.refreshEmailsForAccount
        );
      }
    },

    loadDeletedEmails: emailState.loadDeletedEmails,
    setDeletedEmailsByAccount: emailState.setDeletedEmailsByAccount,
    handleRestoreDeletedEmail,
    handlePurgeDeletedEmail
  };
}
