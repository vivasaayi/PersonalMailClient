import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import dayjs from "dayjs";
import type {
  Account,
  ConnectAccountResponse,
  EmailSummary,
  Provider,
  SenderGroup,
  SenderStatus,
  SyncProgress,
  SyncReport
} from "./types";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail"
};

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
  email: string;
  password: string;
}

const initialFormState: AccountFormState = {
  email: "",
  password: ""
};

export default function App() {
  const [formState, setFormState] = useState<AccountFormState>(initialFormState);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, EmailSummary[]>>({});
  const [senderGroupsByAccount, setSenderGroupsByAccount] = useState<Record<string, SenderGroup[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    async (accountEmail: string, limit = 1000) => {
      try {
        const cached = await invoke<EmailSummary[]>("list_recent_messages", {
          email: accountEmail,
          limit
        });
        setEmailsByAccount((prev: Record<string, EmailSummary[]>) => ({
          ...prev,
          [accountEmail]: cached
        }));
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    []
  );

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
          loadCachedEmails(payload.email, 1000).catch((err) => {
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

  // Periodic polling for emails every 30 seconds
  useEffect(() => {
    if (!selectedAccount) return;

    const interval = setInterval(() => {
      loadCachedEmails(selectedAccount, 1000).catch((err) => {
        console.error("Failed to load cached emails during periodic poll", err);
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedAccount, loadCachedEmails]);

  const expandedSenderForAccount = selectedAccount
    ? expandedSenders[selectedAccount] ?? null
    : null;

  const periodicMinutes = selectedAccount
    ? periodicMinutesByAccount[selectedAccount] ?? 0
    : 0;

  const syncReport = selectedAccount ? syncReports[selectedAccount] ?? null : null;
  const syncProgress = selectedAccount ? syncProgressByAccount[selectedAccount] ?? null : null;

  const handleInputChange = (key: keyof AccountFormState, value: string) => {
    setFormState((prev: AccountFormState) => ({ ...prev, [key]: value }));
  };

  const loadSenderGroups = useCallback(
    async (accountEmail: string) => {
      setIsLoadingGroups(true);
      try {
        const groups = await invoke<SenderGroup[]>("list_sender_groups", {
          email: accountEmail
        });
        setSenderGroupsByAccount((prev: Record<string, SenderGroup[]>) => ({
          ...prev,
          [accountEmail]: groups
        }));
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
        setIsLoadingGroups(false);
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
        setInfo("Refreshing mailbox...");
      }
      setError(null);
      try {
        const recentEmails = await invoke<EmailSummary[]>("fetch_recent", {
          provider: account.provider,
          email: account.email,
          limit
        });
        setEmailsByAccount((prev: Record<string, EmailSummary[]>) => ({
          ...prev,
          [account.email]: recentEmails
        }));
        if (showToast) {
          setInfo("Mailbox updated.");
        }
  await loadCachedEmails(account.email, Math.max(limit, 1000));
        await loadSenderGroups(account.email);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [accounts, loadCachedEmails, loadSenderGroups]
  );

  const submitConnect = async () => {
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const payload = await invoke<ConnectAccountResponse>("connect_account", {
        provider: ACCOUNT_PROVIDER,
        email: formState.email,
        password: formState.password
      });

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

      await loadSenderGroups(payload.account.email);

      setSelectedAccount(payload.account.email);
      setActiveTab("senders");
      setInfo(`Connected to Yahoo as ${payload.account.email}`);
      setFormState(initialFormState);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
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
  await loadCachedEmails(account.email, Math.max(report.stored, 1000));
      await loadSenderGroups(account.email);
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
      await loadSenderGroups(account.email);
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
    if (selectedAccount) {
      void loadSenderGroups(selectedAccount);
    }
  }, [selectedAccount, loadSenderGroups]);

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
          <h2>Add Yahoo account</h2>
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="your.email@yahoo.com"
              value={formState.email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("email", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>App password</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="16-character Yahoo app password"
              value={formState.password}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("password", event.target.value)
              }
            />
            <small className="hint">
              Generate via Yahoo Account Security → Manage app passwords → Mail
            </small>
          </label>
          <button
            type="button"
            className="primary"
            onClick={submitConnect}
            disabled={isSubmitting || !formState.email || !formState.password}
          >
            {isSubmitting ? "Connecting..." : "Connect"}
          </button>
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

      <main className="content">
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
                <strong>{currentEmails.length.toLocaleString()}</strong> cached message
                {currentEmails.length === 1 ? "" : "s"}
              </span>
              {syncReport && (
                <span>
                  Last full sync stored <strong>{syncReport.stored.toLocaleString()}</strong>
                  {" • "}
                  fetched {syncReport.fetched.toLocaleString()}
                </span>
              )}
              {syncProgress && syncProgress.total_batches > 0 && (
                <span>
                  Batch {syncProgress.batch}/{syncProgress.total_batches} (
                  {syncProgress.fetched.toLocaleString()} fetched)
                </span>
              )}
            </div>

            {syncProgress && syncProgress.total_batches > 0 && (
              <div className="sync-progress-bar" aria-hidden="true">
                <div
                  className="sync-progress-value"
                  style={{ width: `${Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))}%` }}
                />
              </div>
            )}

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
                    <div className="sender-groups">
                      {currentSenderGroups.map((group) => {
                        const isExpanded = expandedSenderForAccount === group.sender_email;
                        return (
                          <div
                            key={group.sender_email}
                            className={clsx("sender-group", `status-${group.status}`)}
                          >
                            <button
                              type="button"
                              className="sender-header"
                              onClick={() => toggleSenderExpansion(group.sender_email)}
                            >
                              <div className="sender-ident">
                                <h3>{group.sender_display}</h3>
                                <span className="sender-email">{group.sender_email}</span>
                              </div>
                              <div className="sender-meta">
                                <span className={clsx("status-pill", group.status)}>
                                  {statusLabel(group.status)}
                                </span>
                                <span className="sender-count">
                                  {group.message_count} message{group.message_count === 1 ? "" : "s"}
                                </span>
                              </div>
                            </button>
                            <div className="status-actions">
                              {(["allowed", "neutral", "blocked"] as SenderStatus[]).map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  className={clsx("status-button", status, {
                                    active: group.status === status
                                  })}
                                  onClick={() => handleSenderStatusChange(group.sender_email, status)}
                                  disabled={statusUpdating === group.sender_email || group.status === status}
                                >
                                  {statusLabel(status)}
                                </button>
                              ))}
                            </div>
                            {isExpanded && (
                              <div className="message-list">
                                {group.messages.map((message) => {
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
                                          {message.analysis_categories.map((category) => (
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
                            )}
                          </div>
                        );
                      })}
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
