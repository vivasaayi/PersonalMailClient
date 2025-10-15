import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import dayjs from "dayjs";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

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

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

const MIN_CACHE_FETCH = 1_000;
const MAX_CACHE_FETCH = 50_000;

const ACCOUNT_PROVIDER: Provider = "yahoo";

type TabKey = "recent" | "senders" | "automation";

const tabs: { key: TabKey; label: string; description: string }[] = [
  {
    key: "recent",
    label: "Recent",
    description: "Latest messages fetched from the server"
  },
  {
    key: "senders",
    label: "Senders",
    description: "Grouped conversations with status controls"
  },
  {
    key: "automation",
    label: "Automation",
    description: "Full sync, periodic updates & filters"
  }
];

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

const statusLabel = (status: SenderStatus) => {
  switch (status) {
    case "allowed":
      return "Allowed";
    case "blocked":
      return "Blocked";
    default:
      return "Neutral";
  }
};

// Custom cell renderer for status buttons
const StatusButtonRenderer = (props: any) => {
  const { data, onStatusChange, statusUpdating } = props;
  const statuses: SenderStatus[] = ["allowed", "neutral", "blocked"];

  return (
    <div className="status-actions">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          className={clsx("status-button", status, {
            active: data.status === status
          })}
          onClick={() => onStatusChange(data.sender_email, status)}
          disabled={statusUpdating === data.sender_email || data.status === status}
        >
          {statusLabel(status)}
        </button>
      ))}
    </div>
  );
};

// Custom cell renderer for sender info
const SenderInfoRenderer = (props: any) => {
  const { data, onToggleExpansion, isExpanded } = props;

  return (
    <button
      type="button"
      className="sender-header"
      onClick={() => onToggleExpansion(data.sender_email)}
      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }}
    >
      <div className="sender-ident">
        <h3>{data.sender_display}</h3>
        <span className="sender-email">{data.sender_email}</span>
      </div>
      <div className="sender-meta">
        <span className={clsx("status-pill", data.status)}>
          {statusLabel(data.status)}
        </span>
        <span className="sender-count">
          {data.message_count} message{data.message_count === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
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
  const [activeTab, setActiveTab] = useState<TabKey>("senders");
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
      setActiveTab("senders");
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

  // Memoize AG Grid column definitions to prevent unnecessary re-renders
  const columnDefs = useMemo(() => [
    {
      field: 'sender_display' as const,
      headerName: 'Sender',
      cellRenderer: SenderInfoRenderer,
      cellRendererParams: {
        onToggleExpansion: toggleSenderExpansion,
        isExpanded: (data: any) => expandedSenderForAccount === data.sender_email
      },
      flex: 2,
      minWidth: 250
    },
    {
      field: 'message_count' as const,
      headerName: 'Messages',
      valueFormatter: (params: any) => `${params.value} message${params.value === 1 ? '' : 's'}`,
      width: 120
    },
    {
      field: 'status' as const,
      headerName: 'Status',
      cellRenderer: StatusButtonRenderer,
      cellRendererParams: {
        onStatusChange: handleSenderStatusChange,
        statusUpdating: statusUpdating
      },
      width: 200
    }
  ], [toggleSenderExpansion, expandedSenderForAccount, handleSenderStatusChange, statusUpdating]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
    filter: true
  }), []);

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "";
    }
    return dayjs(value).format("MMM D, YYYY h:mm A");
  };

  return (
    <div className="app-shell">
  <aside className="sidebar">
        <h1>Yahoo Mail Client</h1>
        <p className="subtitle">Connect using Yahoo app passwords over TLS.</p>

        <section className="card">
          <h2>Add Account</h2>
          <label className="field">
            <span>Provider</span>
            <select
              value={formState.provider}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                handleInputChange("provider", event.target.value as Provider)
              }
            >
              {Object.entries(providerLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="your.email@example.com"
              value={formState.email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("email", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="App password or server password"
              value={formState.password}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("password", event.target.value)
              }
            />
            <small className="hint">
              For Yahoo: Generate via Account Security → Manage app passwords → Mail
            </small>
          </label>
          <label className="field">
            <span>Custom IMAP Host (optional)</span>
            <input
              type="text"
              placeholder="e.g., imap.example.com"
              value={formState.customHost || ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("customHost", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Custom IMAP Port (optional)</span>
            <input
              type="number"
              placeholder="993"
              value={formState.customPort || "993"}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("customPort", event.target.value)
              }
            />
          </label>
          <button
            type="button"
            className="primary"
            onClick={submitConnect}
            disabled={isSubmitting || !formState.email || !formState.password}
          >
            {isSubmitting ? "Connecting..." : "Connect"}
          </button>

          <div className="saved-accounts">
            <div className="saved-accounts-header">
              <h3>Saved on this Mac</h3>
              <button
                type="button"
                className="ghost-button"
                onClick={() => loadSavedAccounts()}
                disabled={isLoadingSavedAccounts}
              >
                {isLoadingSavedAccounts ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {isLoadingSavedAccounts ? (
              <p className="muted">Loading saved accounts...</p>
            ) : savedAccounts.length === 0 ? (
              <p className="muted">
                Saved accounts appear after you connect once and grant keychain access.
              </p>
            ) : (
              <ul className="saved-account-list">
                {savedAccounts.map((saved) => (
                  <li key={saved.email} className="saved-account-row">
                    <div className="saved-account-details">
                      <span className="provider">{providerLabels[saved.provider]}</span>
                      <span className="saved-account-email">{saved.email}</span>
                      {!saved.has_password && (
                        <span className="badge warning">Password needed</span>
                      )}
                    </div>
                    <div className="saved-account-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => prefillSavedAccount(saved)}
                        disabled={
                          prefillingSavedEmail === saved.email ||
                          connectingSavedEmail === saved.email
                        }
                      >
                        {prefillingSavedEmail === saved.email ? "Filling..." : "Fill form"}
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => connectSavedAccount(saved)}
                        disabled={
                          !saved.has_password || connectingSavedEmail === saved.email
                        }
                      >
                        {connectingSavedEmail === saved.email ? "Connecting..." : "Connect"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Connected accounts</h2>
          {accounts.length === 0 ? (
            <p className="empty">No accounts connected yet.</p>
          ) : (
            <ul className="account-list">
              {accounts.map((account) => (
                <li key={account.email} className="account-row">
                  <button
                    type="button"
                    className={
                      account.email === selectedAccount ? "link active" : "link"
                    }
                    onClick={() => setSelectedAccount(account.email)}
                  >
                    <span className="provider">{providerLabels[account.provider]}</span>
                    <span>{account.email}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      disconnectAccount(account.email);
                    }}
                    disabled={removingAccount === account.email}
                    aria-label={`Disconnect ${account.email}`}
                  >
                    {removingAccount === account.email ? "…" : "✕"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="content" ref={emailListRef}>
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert info">{info}</div>}

        {selectedAccount ? (
          <div className="mailbox">
            <header className="mailbox-header">
              <div>
                <h2>{selectedAccount}</h2>
                <p className="mailbox-subtitle">
                  Connected via {providerLabels[accounts.find((acct) => acct.email === selectedAccount)?.provider ?? ACCOUNT_PROVIDER]}
                </p>
              </div>
              <div className="mailbox-actions">
                <button type="button" className="link" onClick={refreshEmails}>
                  Refresh recent
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={handleFullSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? "Syncing…" : "Full sync"}
                </button>
              </div>
            </header>

            <div className="mailbox-stats" role="status" aria-live="polite">
              <span>
                <strong>{currentEmails.length.toLocaleString()}</strong>
                {totalCachedCount > currentEmails.length
                  ? ` of ${totalCachedCount.toLocaleString()}`
                  : ""}{" "}
                cached message{totalCachedCount === 1 ? "" : "s"}
              </span>
              {syncReport ? (
                <span>
                  Last full sync stored <strong>{syncReport.stored.toLocaleString()}</strong>
                  {" • "}
                  fetched {syncReport.fetched.toLocaleString()}
                </span>
              ) : null}
              {syncProgress && syncProgress.total_batches > 0 ? (
                <span>
                  Batch {syncProgress.batch}/{syncProgress.total_batches} (
                  {syncProgress.fetched.toLocaleString()} fetched)
                </span>
              ) : null}
            </div>

            {syncProgress && syncProgress.total_batches > 0 ? (
              <div className="sync-progress-bar" aria-hidden="true">
                <div
                  className="sync-progress-value"
                  style={{ width: `${Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))}%` }}
                />
              </div>
            ) : null}

            <nav className="tab-bar" aria-label="Mailbox views">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={clsx("tab", { active: activeTab === tab.key })}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <small>{tab.description}</small>
                </button>
              ))}
            </nav>

            <section className="tab-panel" aria-live="polite">
              {activeTab === "recent" && (
                <div className="tab-content">
                  {currentEmails.length === 0 ? (
                    <p className="empty">No messages in the last fetch window.</p>
                  ) : (
                    <ul className="email-list">
                      {currentEmails.map((email) => (
                        <li key={email.uid}>
                          <div className="email-subject">{email.subject || "(No subject)"}</div>
                          <div className="email-meta">
                            <span>{email.sender.display_name ?? email.sender.email}</span>
                            {email.date && <span>{formatDate(email.date)}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === "senders" && (
                <div className="tab-content">
                  {isLoadingGroups ? (
                    <p className="empty">Loading sender groups…</p>
                  ) : currentSenderGroups.length === 0 ? (
                    <p className="empty">No cached messages yet. Try a full sync.</p>
                  ) : (
                    <div className="ag-theme-alpine" style={{ height: '600px', width: '100%' }}>
                      <AgGridReact
                        rowData={currentSenderGroups}
                        columnDefs={columnDefs as any}
                        defaultColDef={defaultColDef}
                        masterDetail={true}
                        detailRowHeight={300}
                        detailCellRenderer={(props: any) => {
                          const group = props.data;
                          return (
                            <div className="message-list" style={{ padding: '10px' }}>
                              {group.messages.map((message: any) => {
                                const deleteKey = `${group.sender_email}::${message.uid}`;
                                return (
                                  <article key={message.uid} className="message-card">
                                    <header>
                                      <h4>{message.subject || "(No subject)"}</h4>
                                      <span className="message-date">{formatDate(message.date)}</span>
                                    </header>
                                    {message.analysis_sentiment && (
                                      <span className={clsx("sentiment", message.analysis_sentiment)}>
                                        Sentiment: {message.analysis_sentiment}
                                      </span>
                                    )}
                                    <p className="message-snippet">
                                      {message.analysis_summary ?? message.snippet ?? "No preview available."}
                                    </p>
                                    {message.analysis_categories.length > 0 && (
                                      <div className="category-row">
                                        {message.analysis_categories.map((category: string) => (
                                          <span key={category} className="category-chip">
                                            {category}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <footer className="message-actions">
                                      {message.flags && <span className="flags">Flags: {message.flags}</span>}
                                      <button
                                        type="button"
                                        className="outline"
                                        onClick={() => handleDeleteMessage(group.sender_email, message.uid)}
                                        disabled={pendingDeleteUid === deleteKey}
                                      >
                                        {pendingDeleteUid === deleteKey ? "Deleting…" : "Delete"}
                                      </button>
                                    </footer>
                                  </article>
                                );
                              })}
                            </div>
                          );
                        }}
                        onRowGroupOpened={(event) => {
                          // Handle expansion state
                          if (event.expanded && event.data) {
                            setExpandedSenders((prev) => ({
                              ...prev,
                              [selectedAccount!]: event.data!.sender_email
                            }));
                          } else {
                            setExpandedSenders((prev) => ({
                              ...prev,
                              [selectedAccount!]: null
                            }));
                          }
                        }}
                        getRowId={(params) => params.data.sender_email}
                        animateRows={false}
                        suppressRowClickSelection={true}
                        suppressCellFocus={true}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === "automation" && (
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
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handlePeriodicMinutesChange(Number(event.target.value) || 0)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSavePeriodicSync}
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
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setBlockFolder(event.target.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleApplyBlockFilter}
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
                      onClick={handleFullSync}
                      disabled={isSyncing}
                    >
                      {isSyncing ? "Syncing…" : "Run full sync"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="placeholder">
            <h2>Welcome!</h2>
            <p>Connect a Yahoo account using an app password to begin syncing.</p>
          </div>
        )}
      </main>
    </div>
  );
}
