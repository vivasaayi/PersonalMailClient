import { useCallback, useEffect, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";
import type {
  Account,
  DeletedEmail,
  SyncProgress,
  SyncReport,
  SenderStatus
} from "../types";
import type { AccountLifecycleStatus } from "../stores/accountsStore";
import { useNotifications } from "../stores/notifications";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface UseSyncOperationsProps {
  accounts: Account[];
  loadCachedEmails: (accountEmail: string, limit?: number, scrollTop?: number) => Promise<{ cached: any[]; scrollTop?: number }>;
  loadSenderGroups: (accountEmail: string) => Promise<any[]>;
  loadCachedCount: (accountEmail: string) => Promise<number>;
  loadDeletedEmails: (accountEmail: string, limit?: number) => Promise<DeletedEmail[]>;
  maxCachedItemsByAccount: React.MutableRefObject<Record<string, number>>;
  updateSenderStatus: (accountEmail: string, senderEmail: string, status: SenderStatus) => void;
  deleteMessageFromGroups: (accountEmail: string, senderEmail: string, uid: string) => void;
  addDeletedEmail: (accountEmail: string, email: DeletedEmail) => void;
  setAccountStatus: (email: string, status: AccountLifecycleStatus) => void;
  setAccountLastSync: (email: string, timestamp: number) => void;
  registerRemoteDeletes: (accountEmail: string, uids: string[]) => void;
}

const MIN_CACHE_FETCH = 1_000;

const parseDateInputToUtc = (value: string): number => {
  const parts = value.split("-");
  if (parts.length !== 3) return Number.NaN;
  const [year, month, day] = parts.map((part) => Number(part));
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
};

export function useSyncOperations({
  accounts,
  loadCachedEmails,
  loadSenderGroups,
  loadCachedCount,
  loadDeletedEmails,
  maxCachedItemsByAccount,
  updateSenderStatus,
  deleteMessageFromGroups,
  addDeletedEmail,
  setAccountStatus,
  setAccountLastSync,
  registerRemoteDeletes
}: UseSyncOperationsProps) {
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshingAccount, setRefreshingAccount] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [pendingDeleteUid, setPendingDeleteUid] = useState<string | null>(null);
  const [syncReports, setSyncReports] = useState<Record<string, SyncReport | null>>({});
  const [syncProgressByAccount, setSyncProgressByAccount] = useState<Record<string, SyncProgress | null>>({});

  // Listen for sync progress events
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    const register = async () => {
      cleanup = await appWindow.listen<SyncProgress>("full-sync-progress", (event) => {
        if (!mounted || !event.payload) return;
        
        const payload = event.payload;
        setSyncProgressByAccount((prev) => ({
          ...prev,
          [payload.email]: payload
        }));

        if (payload.total_batches > 0) {
          const progressLimit = Math.max(
            maxCachedItemsByAccount.current[payload.email] ?? 0,
            payload.total_batches > 0 ? payload.total_batches * 50 : payload.fetched,
            MIN_CACHE_FETCH
          );
          loadCachedEmails(payload.email, progressLimit).catch((err) => {
            console.error("Failed to load cached emails during sync", err);
          });
        }
      });
    };

    register().catch((err) => {
      console.error("Failed to register sync progress listener", err);
    });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [loadCachedEmails, maxCachedItemsByAccount]);

  const refreshEmailsForAccount = useCallback(
    async (accountEmail: string, limit = 25, showToast = true) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return;

      if (showToast) notifyInfo("Checking for new mail...");
      setAccountStatus(account.email, "syncing");

      try {
        const report = await invoke<SyncReport>("sync_account_incremental", {
          args: {
            provider: account.provider,
            email: account.email,
            chunkSize: 50
          }
        });

        setSyncReports((prev) => ({
          ...prev,
          [account.email]: report
        }));

        if (showToast) {
          if (report.stored > 0) {
            notifySuccess(
              `Fetched ${report.fetched} new message${report.fetched === 1 ? "" : "s"}.`
            );
          } else {
            notifyInfo("Mailbox is up to date.");
          }
        }

        const existingCount = maxCachedItemsByAccount.current[account.email] ?? 0;
        const fetchLimit = Math.max(limit, existingCount, MIN_CACHE_FETCH);

        await loadCachedEmails(account.email, fetchLimit);
        await loadSenderGroups(account.email);
        await loadCachedCount(account.email);
        await loadDeletedEmails(account.email);

        setAccountLastSync(account.email, Date.now());
        setAccountStatus(account.email, "idle");
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
        setAccountStatus(account.email, "error");
      }
    },
    [
      accounts,
      loadCachedEmails,
      loadSenderGroups,
      loadCachedCount,
      loadDeletedEmails,
      maxCachedItemsByAccount,
      notifyError,
      notifyInfo,
      notifySuccess,
      setAccountStatus,
      setAccountLastSync
    ]
  );

  const handleRefreshEmails = useCallback(
    async (accountEmail: string) => {
      setRefreshingAccount(accountEmail);
      try {
        await refreshEmailsForAccount(accountEmail);
      } finally {
        setRefreshingAccount((current) => (current === accountEmail ? null : current));
      }
    },
    [refreshEmailsForAccount]
  );

  const handleFullSync = useCallback(
    async (accountEmail: string) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return;

      notifyInfo("Running full mailbox sync...");
      setAccountStatus(account.email, "syncing");
      setIsSyncing(true);
      setSyncProgressByAccount((prev) => ({
        ...prev,
        [account.email]: {
          email: account.email,
          batch: 0,
          total_batches: 0,
          fetched: 0,
          stored: 0,
          elapsed_ms: 0
        }
      }));

      try {
        const report = await invoke<SyncReport>("sync_account_full", {
          args: {
            provider: account.provider,
            email: account.email,
            chunkSize: 50
          }
        });

        setSyncReports((prev) => ({
          ...prev,
          [account.email]: report
        }));

        notifySuccess(
          `Fetched ${report.fetched} messages (${report.stored} stored) in ${(
            report.duration_ms / 1000
          ).toFixed(1)}s.`
        );

        const fetchLimit = Math.max(
          report.stored,
          maxCachedItemsByAccount.current[account.email] ?? 0,
          MIN_CACHE_FETCH
        );

        await loadCachedEmails(account.email, fetchLimit);
        await loadSenderGroups(account.email);
        await loadCachedCount(account.email);
        await loadDeletedEmails(account.email);
        setAccountLastSync(account.email, Date.now());
        setAccountStatus(account.email, "idle");
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
        setAccountStatus(account.email, "error");
      } finally {
        setIsSyncing(false);
        setSyncProgressByAccount((prev) => ({
          ...prev,
          [account.email]: null
        }));
        setSyncProgressByAccount((prev) => ({
          ...prev,
          [account.email]: null
        }));
      }
    },
    [
      accounts,
      loadCachedEmails,
      loadSenderGroups,
      loadCachedCount,
      loadDeletedEmails,
      maxCachedItemsByAccount,
      notifyError,
      notifyInfo,
      notifySuccess,
      setAccountStatus,
      setAccountLastSync
    ]
  );

  const handleWindowSync = useCallback(
    async (
      accountEmail: string,
      window: { start: string; end?: string | null; chunkSize?: number }
    ) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return;

      const startMs = parseDateInputToUtc(window.start);
      if (Number.isNaN(startMs)) {
        notifyError("Please select a valid start date.");
        return;
      }

      let endMs: number | null = null;
      if (window.end) {
        const parsedEnd = parseDateInputToUtc(window.end);
        if (Number.isNaN(parsedEnd)) {
          notifyError("Please select a valid end date.");
          return;
        }
        if (parsedEnd <= startMs) {
          notifyError("End date must be after the start date.");
          return;
        }
        endMs = parsedEnd;
      }

      notifyInfo("Syncing selected window…");
      setAccountStatus(account.email, "syncing");
      setIsSyncing(true);
      setSyncProgressByAccount((prev) => ({
        ...prev,
        [account.email]: {
          email: account.email,
          batch: 0,
          total_batches: 0,
          fetched: 0,
          stored: 0,
          elapsed_ms: 0
        }
      }));

      try {
        const report = await invoke<SyncReport>("sync_account_window", {
          args: {
            provider: account.provider,
            email: account.email,
            chunkSize: window.chunkSize ?? 50,
            startEpochMs: startMs,
            endEpochMs: endMs
          }
        });

        setSyncReports((prev) => ({
          ...prev,
          [account.email]: report
        }));

        notifySuccess(
          `Window sync stored ${report.stored} message${report.stored === 1 ? "" : "s"}.`
        );

        const fetchLimit = Math.max(
          report.stored,
          maxCachedItemsByAccount.current[account.email] ?? 0,
          MIN_CACHE_FETCH
        );

        await loadCachedEmails(account.email, fetchLimit);
        await loadSenderGroups(account.email);
        await loadCachedCount(account.email);
        await loadDeletedEmails(account.email);

        setAccountLastSync(account.email, Date.now());
        setAccountStatus(account.email, "idle");
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
        setAccountStatus(account.email, "error");
      } finally {
        setIsSyncing(false);
        setSyncProgressByAccount((prev) => ({
          ...prev,
          [account.email]: null
        }));
      }
    },
    [
      accounts,
      loadCachedEmails,
      loadSenderGroups,
      loadCachedCount,
      loadDeletedEmails,
      maxCachedItemsByAccount,
      notifyError,
      notifyInfo,
      notifySuccess,
      setAccountStatus,
      setAccountLastSync
    ]
  );

  const handleSenderStatusChange = useCallback(
    async (accountEmail: string, senderEmail: string, status: SenderStatus) => {
      setStatusUpdating(senderEmail);
      try {
        await invoke("set_sender_status", {
          senderEmail,
          status
        });
        updateSenderStatus(accountEmail, senderEmail, status);
        notifySuccess(`Marked ${senderEmail} as ${status}.`);
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      } finally {
        setStatusUpdating(null);
      }
    },
    [updateSenderStatus, notifyError, notifySuccess]
  );

  const handleDeleteMessage = useCallback(
    async (accountEmail: string, senderEmail: string, uid: string, options?: { suppressNotifications?: boolean }) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return;

      const key = `${senderEmail}::${uid}`;
      setPendingDeleteUid(key);

      try {
        const archived = await invoke<DeletedEmail>("delete_message", {
          provider: account.provider,
          email: account.email,
          uid
        });

        deleteMessageFromGroups(accountEmail, senderEmail, uid);
        addDeletedEmail(accountEmail, archived);
        registerRemoteDeletes(account.email, [archived.uid]);

        if (archived?.remote_error && !options?.suppressNotifications) {
          notifyError(`Message archived locally but failed to delete remotely: ${archived.remote_error}`);
        }
      } catch (err) {
        console.error(err);
        if (!options?.suppressNotifications) {
          notifyError(errorMessage(err));
        }
        throw err; // Re-throw so bulk delete can catch it
      } finally {
        setPendingDeleteUid(null);
      }
    },
    [accounts, addDeletedEmail, deleteMessageFromGroups, notifyError, registerRemoteDeletes]
  );

  const handlePurgeSenderMessages = useCallback(
    async (accountEmail: string, senderEmail: string) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return [];

      try {
        const archived = await invoke<DeletedEmail[]>("purge_sender_messages", {
          provider: account.provider,
          email: account.email,
          senderEmail
        });

        // Update local state for each deleted message
        for (const deleted of archived) {
          deleteMessageFromGroups(accountEmail, senderEmail, deleted.uid);
          addDeletedEmail(accountEmail, deleted);
        }

        registerRemoteDeletes(account.email, archived.map(a => a.uid));

        return archived;
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
        throw err;
      }
    },
    [accounts, addDeletedEmail, deleteMessageFromGroups, notifyError, registerRemoteDeletes]
  );

  const clearSyncData = useCallback((email: string) => {
    setSyncReports((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
    setSyncProgressByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    isSyncing,
    refreshingAccount,
    statusUpdating,
    pendingDeleteUid,
    syncReports,
    syncProgressByAccount,
    refreshEmailsForAccount,
    handleRefreshEmails,
    handleFullSync,
  handleWindowSync,
    handleSenderStatusChange,
    handleDeleteMessage,
    handlePurgeSenderMessages,
    clearSyncData
  };
}
