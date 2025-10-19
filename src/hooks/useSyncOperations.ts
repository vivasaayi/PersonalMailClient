import { useCallback, useEffect, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";
import type {
  Account,
  SyncProgress,
  SyncReport,
  SenderStatus
} from "../types";
import { useNotifications } from "../stores/notifications";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface UseSyncOperationsProps {
  accounts: Account[];
  loadCachedEmails: (accountEmail: string, limit?: number, scrollTop?: number) => Promise<{ cached: any[]; scrollTop?: number }>;
  loadSenderGroups: (accountEmail: string) => Promise<any[]>;
  loadCachedCount: (accountEmail: string) => Promise<number>;
  maxCachedItemsByAccount: React.MutableRefObject<Record<string, number>>;
  updateSenderStatus: (accountEmail: string, senderEmail: string, status: SenderStatus) => void;
  deleteMessageFromGroups: (accountEmail: string, senderEmail: string, uid: string) => void;
  setAccountStatus: (email: string, status: string) => void;
  setAccountLastSync: (email: string, timestamp: number) => void;
}

const MIN_CACHE_FETCH = 1_000;

export function useSyncOperations({
  accounts,
  loadCachedEmails,
  loadSenderGroups,
  loadCachedCount,
  maxCachedItemsByAccount,
  updateSenderStatus,
  deleteMessageFromGroups,
  setAccountStatus,
  setAccountLastSync
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
          provider: account.provider,
          email: account.email,
          chunk_size: 50
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
          provider: account.provider,
          email: account.email,
          chunk_size: 50
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
    async (accountEmail: string, senderEmail: string, uid: string) => {
      const account = accounts.find((acct) => acct.email === accountEmail);
      if (!account) return;

      const key = `${senderEmail}::${uid}`;
      setPendingDeleteUid(key);

      try {
        await invoke("delete_message_remote", {
          provider: account.provider,
          email: account.email,
          uid
        });

        deleteMessageFromGroups(accountEmail, senderEmail, uid);
        notifySuccess("Message deleted from the server and local cache.");
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      } finally {
        setPendingDeleteUid(null);
      }
    },
    [accounts, deleteMessageFromGroups, notifyError, notifySuccess]
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
    handleSenderStatusChange,
    handleDeleteMessage,
    clearSyncData
  };
}
