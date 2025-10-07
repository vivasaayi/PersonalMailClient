import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import dayjs from "dayjs";
const initialFormState = {
    provider: "gmail",
    email: "",
    password: ""
};
const providerLabels = {
    gmail: "Gmail",
    outlook: "Outlook / Live",
    yahoo: "Yahoo Mail"
};
const providerHints = {
    gmail: "Requires an App Password (Google Account → Security → App passwords)",
    outlook: "Use an App Password or your tenant-specific password.",
    yahoo: "Generate an App Password from Account Security → Manage App Passwords."
};
export default function App() {
    const [formState, setFormState] = useState(initialFormState);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [emailsByAccount, setEmailsByAccount] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [removingAccount, setRemovingAccount] = useState(null);
    const currentEmails = useMemo(() => {
        if (!selectedAccount) {
            return [];
        }
        return emailsByAccount[selectedAccount] ?? [];
    }, [emailsByAccount, selectedAccount]);
    const handleInputChange = (key, value) => {
        setFormState((prev) => ({ ...prev, [key]: value }));
    };
    const submitConnect = async () => {
        setError(null);
        setInfo(null);
        setIsSubmitting(true);
        try {
            const payload = await invoke("connect_account", {
                provider: formState.provider,
                email: formState.email,
                password: formState.password
            });
            setAccounts((prev) => {
                const exists = prev.some((acct) => acct.email === payload.account.email);
                if (exists) {
                    return prev.map((acct) => acct.email === payload.account.email ? payload.account : acct);
                }
                return [...prev, payload.account];
            });
            setEmailsByAccount((prev) => ({
                ...prev,
                [payload.account.email]: payload.emails
            }));
            setSelectedAccount(payload.account.email);
            setInfo(`Connected to ${providerLabels[payload.account.provider]} as ${payload.account.email}`);
            setFormState((prev) => ({ ...prev, password: "" }));
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setIsSubmitting(false);
        }
    };
    const refreshEmails = async () => {
        if (!selectedAccount) {
            return;
        }
        const account = accounts.find((acct) => acct.email === selectedAccount);
        if (!account) {
            return;
        }
        setInfo("Refreshing mailbox...");
        setError(null);
        try {
            const recentEmails = await invoke("fetch_recent", {
                provider: account.provider,
                email: account.email,
                limit: 25
            });
            setEmailsByAccount((prev) => ({
                ...prev,
                [account.email]: recentEmails
            }));
            setInfo("Mailbox updated.");
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
    };
    const disconnectAccount = async (email) => {
        setError(null);
        setInfo(null);
        setRemovingAccount(email);
        try {
            await invoke("disconnect_account", { email });
            setAccounts((prev) => {
                const next = prev.filter((acct) => acct.email !== email);
                if (selectedAccount === email) {
                    setSelectedAccount(next[0]?.email ?? null);
                }
                return next;
            });
            setEmailsByAccount((prev) => {
                const { [email]: _removed, ...rest } = prev;
                return rest;
            });
            setInfo(`Disconnected ${email}.`);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setRemovingAccount(null);
        }
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { children: "Personal Mail Client" }), _jsx("p", { className: "subtitle", children: "Securely aggregate Gmail, Outlook, and Yahoo inboxes." }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Add account" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Provider" }), _jsx("select", { value: formState.provider, onChange: (event) => handleInputChange("provider", event.target.value), children: Object.entries(providerLabels).map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) }), _jsx("small", { children: providerHints[formState.provider] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { type: "email", autoComplete: "username", placeholder: "user@example.com", value: formState.email, onChange: (event) => handleInputChange("email", event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "App password" }), _jsx("input", { type: "password", autoComplete: "current-password", placeholder: "Application-specific password", value: formState.password, onChange: (event) => handleInputChange("password", event.target.value) })] }), _jsx("button", { type: "button", className: "primary", disabled: isSubmitting || !formState.email || !formState.password, onClick: submitConnect, children: isSubmitting ? "Connecting..." : "Connect" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Connected accounts" }), accounts.length === 0 ? (_jsx("p", { className: "empty", children: "No accounts connected yet." })) : (_jsx("ul", { className: "account-list", children: accounts.map((account) => (_jsxs("li", { className: "account-row", children: [_jsxs("button", { type: "button", className: account.email === selectedAccount ? "link active" : "link", onClick: () => setSelectedAccount(account.email), children: [_jsx("span", { className: "provider", children: providerLabels[account.provider] }), _jsx("span", { children: account.email })] }), _jsx("button", { type: "button", className: "icon-button", onClick: (event) => {
                                                event.stopPropagation();
                                                disconnectAccount(account.email);
                                            }, disabled: removingAccount === account.email, "aria-label": `Disconnect ${account.email}`, children: removingAccount === account.email ? "…" : "✕" })] }, account.email))) }))] })] }), _jsxs("main", { className: "content", children: [error && _jsx("div", { className: "alert error", children: error }), info && _jsx("div", { className: "alert info", children: info }), selectedAccount ? (_jsxs("div", { className: "mailbox", children: [_jsxs("header", { className: "mailbox-header", children: [_jsx("h2", { children: "Recent mail" }), _jsx("button", { type: "button", className: "link", onClick: refreshEmails, children: "Refresh" })] }), currentEmails.length === 0 ? (_jsx("p", { className: "empty", children: "No messages in the last fetch window." })) : (_jsx("ul", { className: "email-list", children: currentEmails.map((email) => (_jsxs("li", { children: [_jsx("div", { className: "email-subject", children: email.subject || "(No subject)" }), _jsxs("div", { className: "email-meta", children: [_jsx("span", { children: email.from }), email.date && (_jsx("span", { children: dayjs(email.date).format("MMM D, YYYY h:mm A") }))] })] }, email.uid))) }))] })) : (_jsxs("div", { className: "placeholder", children: [_jsx("h2", { children: "Welcome!" }), _jsx("p", { children: "Select or connect an account to begin syncing your inbox." })] }))] })] }));
}
