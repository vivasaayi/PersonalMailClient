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

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail"
};

const ACCOUNT_PROVIDER: Provider = "yahoo";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [removingAccount, setRemovingAccount] = useState<string | null>(null);

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

      setSelectedAccount(payload.account.email);
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
    const account = accounts.find((acct: Account) => acct.email === selectedAccount);
    if (!account) {
      return;
    }
    setInfo("Refreshing mailbox...");
    setError(null);
    try {
      const recentEmails = await invoke<EmailSummary[]>("fetch_recent", {
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
            <p>Connect a Yahoo account using an app password to begin syncing.</p>
          </div>
        )}
      </main>
    </div>
  );
}
