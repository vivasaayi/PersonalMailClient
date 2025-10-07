import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import dayjs from "dayjs";
import type {
  Account,
  ConnectAccountResponse,
  EmailSummary,
  Provider
} from "./types";

interface AccountFormState {
  provider: Provider;
  email: string;
  password: string;
}

const initialFormState: AccountFormState = {
  provider: "gmail",
  email: "",
  password: ""
};

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail"
};

const providerHints: Record<Provider, string> = {
  gmail: "Requires an App Password (Google Account → Security → App passwords)",
  outlook: "Use an App Password or your tenant-specific password.",
  yahoo: "Generate an App Password from Account Security → Manage App Passwords."
};

export default function App() {
  const [formState, setFormState] = useState<AccountFormState>(initialFormState);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [emailsByAccount, setEmailsByAccount] = useState<Record<string, EmailSummary[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [removingAccount, setRemovingAccount] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const currentEmails = useMemo(() => {
    if (!selectedAccount) {
      return [] as EmailSummary[];
    }
    return emailsByAccount[selectedAccount] ?? [];
  }, [emailsByAccount, selectedAccount]);

  const handleInputChange = (key: keyof AccountFormState, value: string) => {
    setFormState((prev: AccountFormState) => ({ ...prev, [key]: value }));
  };

  const submitConnect = async () => {
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const payload: ConnectAccountResponse = await invoke("connect_account", {
        provider: formState.provider,
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

      setSelectedAccount(payload.account.email);
      setInfo(`Connected to ${providerLabels[payload.account.provider]} as ${payload.account.email}`);
      setFormState((prev: AccountFormState) => ({ ...prev, password: "" }));
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
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    setInfo("Refreshing mailbox...");
    setError(null);
    try {
      const recentEmails: EmailSummary[] = await invoke("fetch_recent", {
        provider: account.provider,
        email: account.email,
        limit: 25
      });
      setEmailsByAccount((prev: Record<string, EmailSummary[]>) => ({
        ...prev,
        [account.email]: recentEmails
      }));
      setInfo("Mailbox updated.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
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
        const { [email]: _removed, ...rest } = prev;
        return rest;
      });

      setInfo(`Disconnected ${email}.`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingAccount(null);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Personal Mail Client</h1>
        <p className="subtitle">Securely aggregate Gmail, Outlook, and Yahoo inboxes.</p>

        <section className="card">
          <h2>Add account</h2>
          <label className="field">
            <span>Provider</span>
            <select
              value={formState.provider}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                handleInputChange("provider", event.target.value as Provider)
              }
            >
              {Object.entries(providerLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <small>{providerHints[formState.provider]}</small>
          </label>

          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="user@example.com"
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
              placeholder="Application-specific password"
              value={formState.password}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                handleInputChange("password", event.target.value)
              }
            />
          </label>

          <button
            type="button"
            className="primary"
            disabled={isSubmitting || !formState.email || !formState.password}
            onClick={submitConnect}
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
              <h2>Recent mail</h2>
              <button type="button" className="link" onClick={refreshEmails}>
                Refresh
              </button>
            </header>
            {currentEmails.length === 0 ? (
              <p className="empty">No messages in the last fetch window.</p>
            ) : (
              <ul className="email-list">
                {currentEmails.map((email) => (
                  <li key={email.uid}>
                    <div className="email-subject">{email.subject || "(No subject)"}</div>
                    <div className="email-meta">
                      <span>{email.from}</span>
                      {email.date && (
                        <span>{dayjs(email.date).format("MMM D, YYYY h:mm A")}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="placeholder">
            <h2>Welcome!</h2>
            <p>Select or connect an account to begin syncing your inbox.</p>
          </div>
        )}
      </main>
    </div>
  );
}
