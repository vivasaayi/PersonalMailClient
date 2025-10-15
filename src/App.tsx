import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import dayjs from "dayjs";
import {
  Box,
  Alert,
  Typography,
  Container
} from "@mui/material";
import { Error as ErrorIcon, Info as InfoIcon } from "@mui/icons-material";

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
import AccountForm from "./components/AccountForm";
import AccountList from "./components/AccountList";
import Mailbox from "./components/Mailbox";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

const MIN_CACHE_FETCH = 1_000;
const MAX_CACHE_FETCH = 50_000;

const ACCOUNT_PROVIDER: Provider = "yahoo";

interface AccountFormState {
  provider: Provider;
  email: string;
  password: string;
  customHost?: string;
  customPort?: string;
}

const initialFormState: AccountFormState = {
  provider: ACCOUNT_PROVIDER,
  email: "",
  password: "",
  customHost: "",
  customPort: "993"
};

export default function App() {
  const [formState, setFormState] = useState<AccountFormState>(initialFormState);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, EmailSummary[]>>({});
  const [cachedCountsByAccount, setCachedCountsByAccount] = useState<Record<string, number>>({});
  const [senderGroupsByAccount, setSenderGroupsByAccount] = useState<Record<string, SenderGroup[]>>({});
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSavedAccounts, setIsLoadingSavedAccounts] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [removingAccount, setRemovingAccount] = useState<string | null>(null);
  const [expandedSenders, setExpandedSenders] = useState<Record<string, string | null>>({});
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [pendingDeleteUid, setPendingDeleteUid] = useState<string | null>(null);
  const [syncReports, setSyncReports] = useState<Record<string, SyncReport | null>>({});
  const [syncProgressByAccount, setSyncProgressByAccount] = useState<Record<string, SyncProgress | null>>({});
  const [periodicMinutesByAccount, setPeriodicMinutesByAccount] = useState<Record<string, number>>({});
  const [isSavingPeriodic, setIsSavingPeriodic] = useState(false);
  const [isApplyingBlockFilter, setIsApplyingBlockFilter] = useState(false);
  const [blockFolder, setBlockFolder] = useState<string>("Blocked");
  const [connectingSavedEmail, setConnectingSavedEmail] = useState<string | null>(null);
  const [prefillingSavedEmail, setPrefillingSavedEmail] = useState<string | null>(null);
  const maxCachedItemsByAccount = useRef<Record<string, number>>({});
  const cachedCountRef = useRef<Record<string, number>>({});
  const emailListRef = useRef<HTMLElement>(null);

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
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    []
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
        setError(err instanceof Error ? err.message : String(err));
        return undefined;
      }
    },
    [recordCachedCount]
  );

  const loadSavedAccounts = useCallback(async () => {
    setIsLoadingSavedAccounts(true);
    try {
      const saved = await invoke<SavedAccount[]>("list_saved_accounts");
      setSavedAccounts(saved);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSavedAccounts(false);
    }
  }, []);

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
          setInfo(`Full sync in progress… ${percent}% (${payload.fetched.toLocaleString()} messages)`);
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

  const expandedSenderForAccount = selectedAccount
    ? expandedSenders[selectedAccount] ?? null
    : null;

  const periodicMinutes = selectedAccount
    ? periodicMinutesByAccount[selectedAccount] ?? 0
    : 0;

  const syncReport = selectedAccount ? syncReports[selectedAccount] ?? null : null;
  const syncProgress = selectedAccount ? syncProgressByAccount[selectedAccount] ?? null : null;
  const totalCachedCount = selectedAccount
    ? cachedCountsByAccount[selectedAccount] ?? currentEmails.length
    : currentEmails.length;

  const handleInputChange = (key: keyof AccountFormState, value: string) => {
    setFormState((prev: AccountFormState) => ({ ...prev, [key]: value }));
  };

  const loadSenderGroups = useCallback(
    async (accountEmail: string, options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options;
      if (showLoading) {
        setIsLoadingGroups(true);
      }
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
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (showLoading) {
          setIsLoadingGroups(false);
        }
      }
    },
    [expandedSenders]
  );

  const refreshEmailsForAccount = useCallback(
    async (accountEmail: string, limit = 25, showToast = true) => {
      const account = accounts.find((acct: Account) => acct.email === accountEmail);
      if (!account) {
        return;
      }
      if (showToast) {
        setInfo("Checking for new mail...");
      }
      setError(null);
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
            setInfo(
              `Fetched ${report.fetched} new message${report.fetched === 1 ? "" : "s"}.`
            );
          } else {
            setInfo("Mailbox is up to date.");
          }
        }
        const existingCount = maxCachedItemsByAccount.current[account.email] ?? 0;
        const fetchLimit = Math.max(limit, existingCount, MIN_CACHE_FETCH);
        await loadCachedEmails(account.email, fetchLimit);
        await loadSenderGroups(account.email, { showLoading: showToast });
        await loadCachedCount(account.email);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [accounts, loadCachedEmails, loadSenderGroups, loadCachedCount]
  );

  const applyConnectResponse = useCallback(
    async (payload: ConnectAccountResponse) => {
      setAccounts((prev: Account[]) => {
        const exists = prev.some((acct: Account) => acct.email === payload.account.email);
        if (exists) {
          return prev.map((acct: Account) =>
            acct.email === payload.account.email ? payload.account : acct
          );
        }
        return [...prev, payload.account];
      });

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
    },
    [loadSenderGroups, loadCachedCount]
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

  const submitConnect = async () => {
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const payload = await invoke<ConnectAccountResponse>("connect_account", {
        provider: formState.provider,
        email: formState.email,
        password: formState.password,
        customHost: formState.customHost || undefined,
        customPort: formState.customPort ? parseInt(formState.customPort) : undefined
      });
      await applyConnectResponse(payload);
      await loadSavedAccounts();
      setInfo(`Connected to ${providerLabels[payload.account.provider]} as ${payload.account.email}`);
      setFormState(initialFormState);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const connectSavedAccount = async (saved: SavedAccount) => {
    if (!saved.has_password) {
      await prefillSavedAccount(saved);
      return;
    }

    setError(null);
    setInfo(null);
    setConnectingSavedEmail(saved.email);
    try {
      const payload = await invoke<ConnectAccountResponse>("connect_account_saved", {
        provider: saved.provider,
        email: saved.email
      });
      await applyConnectResponse(payload);
      await loadSavedAccounts();
      setInfo(`Reconnected ${payload.account.email} using saved macOS keychain credentials.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectingSavedEmail(null);
    }
  };

  const prefillSavedAccount = async (saved: SavedAccount) => {
    setError(null);
    setInfo(null);
    setPrefillingSavedEmail(saved.email);
    try {
      let password = "";
      let message: string | null = null;
      if (saved.has_password) {
        const fetched = await invoke<string | null>("get_saved_password", {
          email: saved.email
        });
        if (fetched) {
          password = fetched;
          message = "Loaded password from macOS keychain. Review and connect.";
        } else {
          message = "No password found in macOS keychain. Enter it to reconnect.";
        }
      } else {
        message = "Password isn't stored for this account. Enter it to reconnect.";
      }

      setFormState({
        provider: saved.provider,
        email: saved.email,
        password,
        customHost: saved.custom_host ?? "",
        customPort:
          saved.custom_port != null
            ? String(saved.custom_port)
            : saved.provider === "custom"
            ? ""
            : initialFormState.customPort
      });

      if (message) {
        setInfo(message);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrefillingSavedEmail(null);
    }
  };

  const refreshEmails = async () => {
    if (!selectedAccount) {
      return;
    }
    await refreshEmailsForAccount(selectedAccount);
  };

  const disconnectAccount = async (email: string) => {
    setError(null);
    setInfo(null);
    setRemovingAccount(email);
    try {
      await invoke("disconnect_account", { email });
      setAccounts((prev: Account[]) => {
        const next = prev.filter((acct: Account) => acct.email !== email);
        if (selectedAccount === email) {
          setSelectedAccount(next[0]?.email ?? null);
        }
        return next;
      });
      setEmailsByAccount((prev: Record<string, EmailSummary[]>) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });

      setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });

      setExpandedSenders((prev: Record<string, string | null>) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });

      delete maxCachedItemsByAccount.current[email];
      const nextCountMap = { ...cachedCountRef.current };
      delete nextCountMap[email];
      cachedCountRef.current = nextCountMap;
      setCachedCountsByAccount(nextCountMap);

      setSyncReports((prev: Record<string, SyncReport | null>) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });

      setPeriodicMinutesByAccount((prev: Record<string, number>) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });

      await loadSavedAccounts();
      setInfo(`Disconnected ${email}.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingAccount(null);
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
    setError(null);
    setInfo("Running full mailbox sync...");
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
      setInfo(
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
      await loadSenderGroups(account.email, { showLoading: false });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
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
    setError(null);
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
      setInfo(`Marked ${senderEmail} as ${status}.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
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
    setError(null);
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
      setInfo("Message deleted from the server and local cache.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
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
    setError(null);
    try {
      await invoke("configure_periodic_sync", {
        provider: account.provider,
        email: account.email,
        minutes
      });
      if (minutes) {
        setInfo(`Periodic sync every ${minutes} minute${minutes === 1 ? "" : "s"} enabled.`);
      } else {
        setInfo("Periodic sync disabled.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
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
    setError(null);
    try {
      const moved = await invoke<number>("apply_block_filter", {
        provider: account.provider,
        email: account.email,
        target_folder: blockFolder.trim() ? blockFolder.trim() : null
      });
      await refreshEmailsForAccount(account.email, 25, false);
      if (moved > 0) {
        setInfo(`Moved ${moved} message${moved === 1 ? "" : "s"} to ${blockFolder || "the blocked folder"}.`);
      } else {
        setInfo("No messages matched the blocked list.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplyingBlockFilter(false);
    }
  };

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
        await loadSenderGroups(selectedAccount, {
          showLoading: (senderGroupsByAccount[selectedAccount]?.length ?? 0) === 0
        });
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

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "";
    }
    return dayjs(value).format("MMM D, YYYY h:mm A");
  };

  return (
    <Container maxWidth={false} sx={{ height: '100vh', py: 2 }}>
      <Box display="flex" gap={3} height="100%">
        {/* Sidebar */}
        <Box
          component="aside"
          sx={{
            width: 360,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          <Box sx={{ mb: 2 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Yahoo Mail Client
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect using Yahoo app passwords over TLS.
            </Typography>
          </Box>

        <AccountForm
          formState={formState}
          onFormStateChange={handleInputChange}
          onConnect={submitConnect}
          onPrefill={prefillSavedAccount}
          onConnectSaved={connectSavedAccount}
          savedAccounts={savedAccounts}
          isLoadingSavedAccounts={isLoadingSavedAccounts}
          onLoadSavedAccounts={loadSavedAccounts}
          isSubmitting={isSubmitting}
          prefillingSavedEmail={prefillingSavedEmail}
          connectingSavedEmail={connectingSavedEmail}
        />          <AccountList
            accounts={accounts}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            onDisconnect={disconnectAccount}
            removingAccount={removingAccount}
          />
        </Box>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
          ref={emailListRef}
        >
          {/* Alerts */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} icon={<ErrorIcon />}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="info" sx={{ mb: 2 }} icon={<InfoIcon />}>
              {info}
            </Alert>
          )}

          {selectedAccount ? (
            <Mailbox
              selectedAccount={selectedAccount}
              accounts={accounts}
              emails={currentEmails}
              senderGroups={currentSenderGroups}
              totalCachedCount={totalCachedCount}
              syncReport={syncReport}
              syncProgress={syncProgress}
              onRefreshEmails={refreshEmails}
              onFullSync={handleFullSync}
              isSyncing={isSyncing}
              expandedSenderForAccount={expandedSenders[selectedAccount] || null}
              onToggleExpansion={toggleSenderExpansion}
              onStatusChange={(senderEmail: string, status: string) => handleSenderStatusChange(senderEmail, status as SenderStatus)}
              statusUpdating={statusUpdating}
              onDeleteMessage={handleDeleteMessage}
              pendingDeleteUid={pendingDeleteUid}
              periodicMinutes={periodicMinutes}
              onPeriodicMinutesChange={handlePeriodicMinutesChange}
              onSavePeriodicSync={handleSavePeriodicSync}
              isSavingPeriodic={isSavingPeriodic}
              blockFolder={blockFolder}
              onBlockFolderChange={setBlockFolder}
              onApplyBlockFilter={handleApplyBlockFilter}
              isApplyingBlockFilter={isApplyingBlockFilter}
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center'
              }}
            >
              <Typography variant="h4" component="h2" gutterBottom>
                Welcome!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Connect a Yahoo account using an app password to begin syncing.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Container>
  );
}
