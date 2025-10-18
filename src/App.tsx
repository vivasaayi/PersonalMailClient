import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { createElement } from 'react';
import { invoke } from "@tauri-apps/api/tauri";

import { useAccountsStore } from "./stores/accountsStore";

import type {
  Account,
  ConnectAccountResponse,
  EmailSummary,
  SavedAccount,
  Provider,
  SenderGroup,
  SenderStatus,
  SyncProgress,
  SyncReport
} from "./types";
import NavigationDrawer from "./components/NavigationDrawer";
import ConnectionWizard from "./components/ConnectionWizard";
import SavedAccountsDialog from "./components/SavedAccountsDialog";
import Mailbox from "./components/Mailbox";
import SettingsView from "./components/SettingsView";
import AutomationView from "./components/AutomationView";
import AccountsView from "./components/AccountsView";
import NotificationsHost from "./components/NotificationsHost";
import { useNotifications } from "./stores/notifications";
import { buildSyncStatusPills } from "./utils/mailboxStatus";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

const MIN_CACHE_FETCH = 1_000;
const MAX_CACHE_FETCH = 50_000;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function App() {
  const {
    accounts,
    savedAccounts,
    connectingSavedEmail,
    runtimeByEmail,
    setAccountStatus,
    setAccountLastSync,
    refreshSavedAccounts,
    connectSavedAccount: connectSavedAccountAction,
    disconnectAccount: disconnectAccountAction,
    upsertAccount
  } = useAccountsStore();
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, EmailSummary[]>>({});
  const [cachedCountsByAccount, setCachedCountsByAccount] = useState<Record<string, number>>({});
  const [senderGroupsByAccount, setSenderGroupsByAccount] = useState<Record<string, SenderGroup[]>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshingAccount, setRefreshingAccount] = useState<string | null>(null);
  const [expandedSenders, setExpandedSenders] = useState<Record<string, string | null>>({});
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [pendingDeleteUid, setPendingDeleteUid] = useState<string | null>(null);
  const [syncReports, setSyncReports] = useState<Record<string, SyncReport | null>>({});
  const [syncProgressByAccount, setSyncProgressByAccount] = useState<Record<string, SyncProgress | null>>({});
  const [periodicMinutesByAccount, setPeriodicMinutesByAccount] = useState<Record<string, number>>({});
  const [isSavingPeriodic, setIsSavingPeriodic] = useState(false);
  const [isApplyingBlockFilter, setIsApplyingBlockFilter] = useState(false);
  const [blockFolder, setBlockFolder] = useState<string>("Blocked");
  const maxCachedItemsByAccount = useRef<Record<string, number>>({});
  const cachedCountRef = useRef<Record<string, number>>({});
  const emailListRef = useRef<HTMLElement>(null);

  // Navigation state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [currentView, setCurrentView] = useState<string>('mailbox');
  const [connectionWizardOpen, setConnectionWizardOpen] = useState(false);
  const [savedAccountsDialogOpen, setSavedAccountsDialogOpen] = useState(false);

  const currentEmails = useMemo(() => {
    if (!selectedAccount) {
      return [] as EmailSummary[];
    }
    return emailsByAccount[selectedAccount] ?? [];
  }, [emailsByAccount, selectedAccount]);

  const currentSenderGroups = useMemo(() => {
    if (!selectedAccount) {
      return [] as SenderGroup[];
    }
    return senderGroupsByAccount[selectedAccount] ?? [];
  }, [selectedAccount, senderGroupsByAccount]);

  const loadCachedEmails = useCallback(
    async (accountEmail: string, limit?: number) => {
      try {
        // Capture scroll position before updating
        const scrollTop = emailListRef.current?.scrollTop ?? 0;

        const previousMax = maxCachedItemsByAccount.current[accountEmail] ?? 0;
        const knownTotal = cachedCountRef.current[accountEmail] ?? 0;
        const requested = limit ?? previousMax;
        const baseline = requested > 0 ? requested : MIN_CACHE_FETCH;
        const desired = Math.max(baseline, previousMax, knownTotal, MIN_CACHE_FETCH);
        const effectiveLimit = Math.min(desired, MAX_CACHE_FETCH);
        maxCachedItemsByAccount.current[accountEmail] = Math.max(
          maxCachedItemsByAccount.current[accountEmail] ?? 0,
          effectiveLimit,
          Math.min(knownTotal, MAX_CACHE_FETCH)
        );
        const cached = await invoke<EmailSummary[]>("list_recent_messages", {
          email: accountEmail,
          limit: effectiveLimit
        });
        maxCachedItemsByAccount.current[accountEmail] = Math.max(
          maxCachedItemsByAccount.current[accountEmail] ?? 0,
          cached.length,
          Math.min(knownTotal, MAX_CACHE_FETCH)
        );
        setEmailsByAccount((prev: Record<string, EmailSummary[]>) => ({
          ...prev,
          [accountEmail]: cached
        }));

        // Restore scroll position after state update
        requestAnimationFrame(() => {
          if (emailListRef.current) {
            emailListRef.current.scrollTop = scrollTop;
          }
        });
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [notifyError]
  );

  const recordCachedCount = useCallback((accountEmail: string, count: number) => {
    cachedCountRef.current = {
      ...cachedCountRef.current,
      [accountEmail]: count
    };
    setCachedCountsByAccount(cachedCountRef.current);
    const capped = Math.min(count, MAX_CACHE_FETCH);
    maxCachedItemsByAccount.current[accountEmail] = Math.max(
      maxCachedItemsByAccount.current[accountEmail] ?? 0,
      capped,
      MIN_CACHE_FETCH
    );
  }, []);

  const loadCachedCount = useCallback(
    async (accountEmail: string) => {
      try {
        const count = await invoke<number>("cached_message_count", { email: accountEmail });
        recordCachedCount(accountEmail, count);
        return count;
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
        return undefined;
      }
    },
    [recordCachedCount, notifyError]
  );

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

    const register = async () => {
      cleanup = await appWindow.listen<SyncProgress>("full-sync-progress", (event) => {
        if (!mounted || !event.payload) {
          return;
        }
        const payload = event.payload;
        setSyncProgressByAccount((prev: Record<string, SyncProgress | null>) => ({
          ...prev,
          [payload.email]: payload
        }));

        if (selectedAccount === payload.email && payload.total_batches > 0) {
          const percent = Math.min(
            100,
            Math.round((payload.batch / payload.total_batches) * 100)
          );
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
      if (cleanup) {
        cleanup();
      }
    };
  }, [selectedAccount, loadCachedEmails]);

  const periodicMinutes = selectedAccount
    ? periodicMinutesByAccount[selectedAccount] ?? 0
    : 0;

  const syncReport = selectedAccount ? syncReports[selectedAccount] ?? null : null;
  const syncProgress = selectedAccount ? syncProgressByAccount[selectedAccount] ?? null : null;
  const totalCachedCount = selectedAccount
    ? cachedCountsByAccount[selectedAccount] ?? currentEmails.length
    : currentEmails.length;
  const selectedAccountEntity = selectedAccount
    ? accounts.find((acct) => acct.email === selectedAccount) ?? null
    : null;

  const selectedAccountStatusPills = selectedAccount
    ? buildSyncStatusPills({
        isSyncing,
        isRefreshing: refreshingAccount === selectedAccount,
        syncReport,
        syncProgress,
        emailsCount: currentEmails.length,
        totalKnownMessages: totalCachedCount
      })
    : [];

  const loadSenderGroups = useCallback(
    async (accountEmail: string) => {
      try {
        const groups = await invoke<SenderGroup[]>("list_sender_groups", {
          email: accountEmail
        });
        setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => {
          const existing = prev[accountEmail] ?? [];
          const unchanged =
            existing.length === groups.length &&
            existing.every((group, index) => {
              const next = groups[index];
              if (!next) return false;
              const sameMeta =
                group.sender_email === next.sender_email &&
                group.status === next.status &&
                group.message_count === next.message_count &&
                group.messages.length === next.messages.length;
              if (!sameMeta) {
                return false;
              }
              // compare message metadata without deep diffing the whole payload
              return group.messages.every((msg, msgIdx) => {
                const nextMsg = next.messages[msgIdx];
                if (!nextMsg) return false;
                return (
                  msg.uid === nextMsg.uid &&
                  msg.subject === nextMsg.subject &&
                  msg.date === nextMsg.date &&
                  msg.snippet === nextMsg.snippet &&
                  msg.analysis_summary === nextMsg.analysis_summary &&
                  msg.analysis_sentiment === nextMsg.analysis_sentiment
                );
              });
            });

          if (unchanged) {
            return prev;
          }

          const updated = {
            ...prev,
            [accountEmail]: groups
          };

          return updated;
        });
        if (groups.length > 0 && !expandedSenders[accountEmail]) {
          setExpandedSenders((prev: Record<string, string | null>) => ({
            ...prev,
            [accountEmail]: groups[0].sender_email
          }));
        }
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      }
    },
    [expandedSenders, notifyError]
  );

  const refreshEmailsForAccount = useCallback(
    async (accountEmail: string, limit = 25, showToast = true) => {
      const account = accounts.find((acct: Account) => acct.email === accountEmail);
      if (!account) {
        return;
      }
      if (showToast) {
        notifyInfo("Checking for new mail...");
      }
      setAccountStatus(account.email, "syncing");
      try {
        const report = await invoke<SyncReport>("sync_account_incremental", {
          provider: account.provider,
          email: account.email,
          chunk_size: 50
        });
        setSyncReports((prev: Record<string, SyncReport | null>) => ({
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
      notifyError,
      notifyInfo,
      notifySuccess,
      setAccountStatus,
      setAccountLastSync
    ]
  );

  const applyConnectResponse = useCallback(
    async (payload: ConnectAccountResponse) => {
      upsertAccount(payload.account);

      setEmailsByAccount((prev: Record<string, EmailSummary[]>) => ({
        ...prev,
        [payload.account.email]: payload.emails
      }));
      maxCachedItemsByAccount.current[payload.account.email] = Math.max(
        payload.emails.length,
        MIN_CACHE_FETCH
      );

      await loadSenderGroups(payload.account.email);
      await loadCachedCount(payload.account.email);

      setSelectedAccount(payload.account.email);
      setCurrentView('mailbox');
    },
    [loadSenderGroups, loadCachedCount, upsertAccount]
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

  // Periodic polling for emails every 30 seconds
  useEffect(() => {
    if (!selectedAccount) return;

    const interval = setInterval(() => {
      const periodicLimit = Math.max(
        maxCachedItemsByAccount.current[selectedAccount] ?? 0,
        MIN_CACHE_FETCH
      );
      refreshEmailsForAccount(selectedAccount, periodicLimit, false).catch((err) => {
        console.error("Failed to run incremental sync during periodic poll", err);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedAccount, refreshEmailsForAccount]);

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

  const handleRemoveAccount = async (email: string) => {
    try {
      await disconnectAccountAction(email);
      setEmailsByAccount((prev: Record<string, EmailSummary[]>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setCachedCountsByAccount((prev: Record<string, number>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setSyncReports((prev: Record<string, SyncReport | null>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setSyncProgressByAccount((prev: Record<string, SyncProgress | null>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setPeriodicMinutesByAccount((prev: Record<string, number>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      setExpandedSenders((prev: Record<string, string | null>) => {
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });
      if (selectedAccount === email) {
        setSelectedAccount(null);
        setCurrentView('accounts');
      }
      delete maxCachedItemsByAccount.current[email];
      delete cachedCountRef.current[email];
      notifyInfo(`Disconnected and removed ${email}.`);
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    }
  };

  const refreshEmails = async () => {
    if (!selectedAccount) {
      return;
    }
    const email = selectedAccount;
    setRefreshingAccount(email);
    try {
      await refreshEmailsForAccount(email);
    } finally {
      setRefreshingAccount((current) => (current === email ? null : current));
    }
  };

  const handleFullSync = async () => {
    if (!selectedAccount) {
      return;
    }
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    notifyInfo("Running full mailbox sync...");
    setAccountStatus(account.email, "syncing");
    setIsSyncing(true);
    setSyncProgressByAccount((prev: Record<string, SyncProgress | null>) => ({
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
      setSyncReports((prev: Record<string, SyncReport | null>) => ({
        ...prev,
        [account.email]: report
      }));
      notifySuccess(
        `Fetched ${report.fetched} messages (${report.stored} stored) in ${(report.duration_ms / 1000).toFixed(
          1
        )}s.`
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
      setSyncProgressByAccount((prev: Record<string, SyncProgress | null>) => ({
        ...prev,
        [account.email]: null
      }));
    }
  };

  const handleSenderStatusChange = async (senderEmail: string, status: SenderStatus) => {
    if (!selectedAccount) {
      return;
    }
    setStatusUpdating(senderEmail);
    try {
      await invoke("set_sender_status", {
        senderEmail,
        status
      });
      setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => {
        const current = prev[selectedAccount] ?? [];
        const updated = current.map((group) => {
          if (group.sender_email !== senderEmail) {
            return group;
          }
          return {
            ...group,
            status,
            messages: group.messages.map((message) => ({
              ...message,
              status
            }))
          };
        });
        return {
          ...prev,
          [selectedAccount]: updated
        };
      });
      notifySuccess(`Marked ${senderEmail} as ${status}.`);
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleDeleteMessage = async (senderEmail: string, uid: string) => {
    if (!selectedAccount) {
      return;
    }
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    const key = `${senderEmail}::${uid}`;
    setPendingDeleteUid(key);
    try {
      await invoke("delete_message_remote", {
        provider: account.provider,
        email: account.email,
        uid
      });
      setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => {
        const current = prev[selectedAccount] ?? [];
        const updated = current
          .map((group) => {
            if (group.sender_email !== senderEmail) {
              return group;
            }
            const filtered = group.messages.filter((message) => message.uid !== uid);
            return {
              ...group,
              messages: filtered,
              message_count: filtered.length
            };
          })
          .filter((group) => group.message_count > 0);
        return {
          ...prev,
          [selectedAccount]: updated
        };
      });
      setEmailsByAccount((prev: Record<string, EmailSummary[]>) => {
        const current = prev[selectedAccount] ?? [];
        return {
          ...prev,
          [selectedAccount]: current.filter((message) => message.uid !== uid)
        };
      });
      notifySuccess("Message deleted from the server and local cache.");
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    } finally {
      setPendingDeleteUid(null);
    }
  };

  const handlePeriodicMinutesChange = (value: number) => {
    if (!selectedAccount) {
      return;
    }
    setPeriodicMinutesByAccount((prev: Record<string, number>) => ({
      ...prev,
      [selectedAccount]: value
    }));
  };

  const handleSavePeriodicSync = async () => {
    if (!selectedAccount) {
      return;
    }
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    const minutes = periodicMinutes > 0 ? periodicMinutes : null;
    setIsSavingPeriodic(true);
    try {
      await invoke("configure_periodic_sync", {
        provider: account.provider,
        email: account.email,
        minutes
      });
      if (minutes) {
        notifySuccess(`Periodic sync every ${minutes} minute${minutes === 1 ? "" : "s"} enabled.`);
      } else {
        notifyInfo("Periodic sync disabled.");
      }
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    } finally {
      setIsSavingPeriodic(false);
    }
  };

  const handleApplyBlockFilter = async () => {
    if (!selectedAccount) {
      return;
    }
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    setIsApplyingBlockFilter(true);
    try {
      const moved = await invoke<number>("apply_block_filter", {
        provider: account.provider,
        email: account.email,
        target_folder: blockFolder.trim() ? blockFolder.trim() : null
      });
      await refreshEmailsForAccount(account.email, 25, false);
      if (moved > 0) {
        notifySuccess(`Moved ${moved} message${moved === 1 ? "" : "s"} to ${blockFolder || "the blocked folder"}.`);
      } else {
        notifyInfo("No messages matched the blocked list.");
      }
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    } finally {
      setIsApplyingBlockFilter(false);
    }
  };

  // Navigation handlers
  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleAccountSelect = (email: string | null) => {
    setSelectedAccount(email);
    if (email) {
      setCurrentView('mailbox');
    }
  };

  const handleNavigate = (view: string) => {
    setCurrentView(view);
  };

  const handleOpenConnectionWizard = () => {
    setConnectionWizardOpen(true);
  };

  const handleCloseConnectionWizard = () => {
    setConnectionWizardOpen(false);
  };

  const handleOpenSavedAccountsDialog = () => {
    loadSavedAccounts();
    setSavedAccountsDialogOpen(true);
  };

  const handleCloseSavedAccountsDialog = () => {
    setSavedAccountsDialogOpen(false);
  };

  useEffect(() => {
    if (accounts.length === 0 && ['mailbox', 'automation', 'sync', 'blocked'].includes(currentView)) {
      setCurrentView('accounts');
    }
  }, [accounts.length, currentView]);

  useEffect(() => {
    if (!selectedAccount) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const count = await loadCachedCount(selectedAccount);
        if (cancelled) return;
        const cappedTotal = count ? Math.min(count, MAX_CACHE_FETCH) : 0;
        const initialFetchLimit = Math.max(
          cappedTotal,
          maxCachedItemsByAccount.current[selectedAccount] ?? 0,
          2000,
          MIN_CACHE_FETCH
        );

        await loadCachedEmails(selectedAccount, initialFetchLimit);
        if (cancelled) return;
        await loadSenderGroups(selectedAccount);
        if (cancelled) return;
        await refreshEmailsForAccount(selectedAccount, initialFetchLimit, false);
      } catch (err) {
        console.error("Failed to bootstrap account cache", err);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [selectedAccount, loadCachedCount, loadCachedEmails, loadSenderGroups, refreshEmailsForAccount, senderGroupsByAccount]);

  const toggleSenderExpansion = (senderEmail: string) => {
    if (!selectedAccount) {
      return;
    }
    setExpandedSenders((prev: Record<string, string | null>) => {
      const current = prev[selectedAccount] ?? null;
      return {
        ...prev,
        [selectedAccount]: current === senderEmail ? null : senderEmail
      };
    });
  };

  return createElement('div', { style: { display: 'flex', height: '100vh' } }, [
    // Navigation Drawer
    createElement(NavigationDrawer, {
      key: 'nav-drawer',
      open: drawerOpen,
      accounts: accounts,
      selectedAccount: selectedAccount,
      runtimeByEmail,
      onAccountSelect: handleAccountSelect,
      onNavigate: handleNavigate,
      currentView: currentView,
      onOpenSavedAccounts: handleOpenSavedAccountsDialog,
      hasSavedAccounts: savedAccounts.length > 0
    }),

    // Main Content
    createElement('main', {
      key: 'main-content',
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }
    }, [
      // App Bar
      createElement('header', {
        key: 'app-bar',
        style: {
          backgroundColor: '#ffffff',
          color: '#000000',
          borderBottom: '1px solid #e5e7eb',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          zIndex: 1100
        }
      }, [
        createElement(ButtonComponent, {
          key: 'menu-button',
          cssClass: 'menu-button',
          content: '☰',
          onClick: handleDrawerToggle
        }),
        createElement('h1', {
          key: 'title',
          style: {
            flexGrow: 1,
            fontSize: '1.25rem',
            fontWeight: '500',
            margin: '0 0 0 16px'
          }
        }, 'Personal Mail Client')
      ]),

      // Content Area
      createElement('div', {
        key: 'content-area',
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          padding: 0
        },
        ref: emailListRef
      }, [
        // View Content
      currentView === 'mailbox' && selectedAccount ? createElement(Mailbox, {
          key: 'mailbox-view',
          selectedAccount: selectedAccount,
          accounts: accounts,
          emails: currentEmails,
          senderGroups: currentSenderGroups,
          totalCachedCount: totalCachedCount,
          syncReport: syncReport,
          syncProgress: syncProgress,
          onRefreshEmails: refreshEmails,
          onFullSync: handleFullSync,
          isSyncing: isSyncing,
      isRefreshing: refreshingAccount === selectedAccount,
          expandedSenderForAccount: expandedSenders[selectedAccount] || null,
          onToggleExpansion: toggleSenderExpansion,
          onStatusChange: (senderEmail: string, status: string) => handleSenderStatusChange(senderEmail, status as SenderStatus),
          statusUpdating: statusUpdating,
          onDeleteMessage: handleDeleteMessage,
          pendingDeleteUid: pendingDeleteUid
        }) : currentView === 'automation' && selectedAccount ? createElement(AutomationView, {
          key: 'automation-view',
          account: selectedAccountEntity,
          email: selectedAccount,
          periodicMinutes: periodicMinutes,
          onPeriodicMinutesChange: handlePeriodicMinutesChange,
          onSavePeriodicSync: handleSavePeriodicSync,
          isSavingPeriodic: isSavingPeriodic,
          blockFolder: blockFolder,
          onBlockFolderChange: setBlockFolder,
          onApplyBlockFilter: handleApplyBlockFilter,
          isApplyingBlockFilter: isApplyingBlockFilter,
          syncReport: syncReport,
          syncProgress: syncProgress,
          onFullSync: handleFullSync,
          isSyncing: isSyncing,
          isRefreshing: refreshingAccount === selectedAccount,
          emailsCount: currentEmails.length,
          totalKnownMessages: totalCachedCount
        }) : currentView === 'accounts' ? createElement(AccountsView, {
          key: 'accounts-view',
          accounts: accounts,
          savedAccounts: savedAccounts,
          runtimeByEmail,
          selectedAccount: selectedAccount,
          activeAccount: selectedAccountEntity,
          statusPills: selectedAccountStatusPills,
          syncReport: syncReport,
          syncProgress: syncProgress,
          isSyncing: isSyncing,
          isRefreshing: refreshingAccount === selectedAccount,
          emailsCount: currentEmails.length,
          totalKnownMessages: totalCachedCount,
          onAddAccount: handleOpenConnectionWizard,
          onSelectAccount: (email: string) => {
            handleAccountSelect(email);
          },
          onConnectSaved: handleConnectSavedAccount,
          onRemoveAccount: handleRemoveAccount,
          connectingSavedEmail: connectingSavedEmail
        }) : currentView === 'settings' ? createElement(SettingsView, { key: 'settings-view' }) : currentView === 'sync' && selectedAccount ? createElement('div', {
          key: 'sync-view',
          style: { padding: '24px' }
        }, [
          createElement('h2', { key: 'sync-title', style: { marginBottom: '16px' } }, `Sync Settings for ${selectedAccount}`),
          createElement('p', { key: 'sync-desc', style: { color: '#6b7280' } }, 'Sync configuration will be implemented here.')
        ]) : currentView === 'blocked' && selectedAccount ? createElement('div', {
          key: 'blocked-view',
          style: { padding: '24px' }
        }, [
          createElement('h2', { key: 'blocked-title', style: { marginBottom: '16px' } }, `Blocked Senders for ${selectedAccount}`),
          createElement('p', { key: 'blocked-desc', style: { color: '#6b7280' } }, 'Blocked senders management will be implemented here.')
        ]) : createElement('div', {
          key: 'welcome-view',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center'
          }
        }, [
          createElement('h2', { key: 'welcome-title', style: { marginBottom: '16px' } }, 'Welcome to Personal Mail Client'),
          createElement('p', { key: 'welcome-desc', style: { marginBottom: '32px', color: '#6b7280' } }, 'Connect an email account to get started with professional email management.'),
          createElement('div', {
            key: 'welcome-actions',
            style: {
              display: 'flex',
              gap: '12px'
            }
          }, [
            createElement(ButtonComponent, {
              key: 'connect-button',
              cssClass: 'primary large',
              content: '+ Connect Account',
              onClick: handleOpenConnectionWizard
            }),
            createElement(ButtonComponent, {
              key: 'saved-accounts-button',
              cssClass: 'e-outline large',
              content: 'Saved Accounts',
              onClick: handleOpenSavedAccountsDialog
            })
          ])
        ])
      ])
    ]),

    // Floating Action Button
    createElement(ButtonComponent, {
      key: 'fab',
      cssClass: 'fab primary',
      content: '+',
      onClick: handleOpenConnectionWizard
    }),

    // Connection Wizard
    createElement(ConnectionWizard, {
      key: 'connection-wizard',
      open: connectionWizardOpen,
      onClose: handleCloseConnectionWizard,
      onConnected: handleAccountConnected
    }),

    // Saved Accounts Dialog
    createElement(SavedAccountsDialog, {
      key: 'saved-accounts-dialog',
      open: savedAccountsDialogOpen,
      onClose: handleCloseSavedAccountsDialog,
      savedAccounts: savedAccounts,
  onConnectSaved: handleConnectSavedAccount,
      connectingSavedEmail: connectingSavedEmail,
      onOpenConnectionWizard: handleOpenConnectionWizard
    }),

    createElement(NotificationsHost, { key: 'notifications-host' })
  ]);
}
