import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import clsx from "clsx";
import dayjs from "dayjs";
const providerLabels = {
    gmail: "Gmail",
    outlook: "Outlook / Live",
    yahoo: "Yahoo Mail",
    custom: "Custom IMAP"
};
const MIN_CACHE_FETCH = 1000;
const MAX_CACHE_FETCH = 50000;
const ACCOUNT_PROVIDER = "yahoo";
const tabs = [
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
const initialFormState = {
    provider: ACCOUNT_PROVIDER,
    email: "",
    password: "",
    customHost: "",
    customPort: "993"
};
export default function App() {
    const [formState, setFormState] = useState(initialFormState);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [emailsByAccount, setEmailsByAccount] = useState({});
    const [cachedCountsByAccount, setCachedCountsByAccount] = useState({});
    const [senderGroupsByAccount, setSenderGroupsByAccount] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [removingAccount, setRemovingAccount] = useState(null);
    const [activeTab, setActiveTab] = useState("senders");
    const [expandedSenders, setExpandedSenders] = useState({});
    const [statusUpdating, setStatusUpdating] = useState(null);
    const [pendingDeleteUid, setPendingDeleteUid] = useState(null);
    const [syncReports, setSyncReports] = useState({});
    const [syncProgressByAccount, setSyncProgressByAccount] = useState({});
    const [periodicMinutesByAccount, setPeriodicMinutesByAccount] = useState({});
    const [isSavingPeriodic, setIsSavingPeriodic] = useState(false);
    const [isApplyingBlockFilter, setIsApplyingBlockFilter] = useState(false);
    const [blockFolder, setBlockFolder] = useState("Blocked");
    const maxCachedItemsByAccount = useRef({});
    const cachedCountRef = useRef({});
    const currentEmails = useMemo(() => {
        if (!selectedAccount) {
            return [];
        }
        return emailsByAccount[selectedAccount] ?? [];
    }, [emailsByAccount, selectedAccount]);
    const currentSenderGroups = useMemo(() => {
        if (!selectedAccount) {
            return [];
        }
        return senderGroupsByAccount[selectedAccount] ?? [];
    }, [selectedAccount, senderGroupsByAccount]);
    const loadCachedEmails = useCallback(async (accountEmail, limit) => {
        try {
            const previousMax = maxCachedItemsByAccount.current[accountEmail] ?? 0;
            const knownTotal = cachedCountRef.current[accountEmail] ?? 0;
            const requested = limit ?? previousMax;
            const baseline = requested > 0 ? requested : MIN_CACHE_FETCH;
            const desired = Math.max(baseline, previousMax, knownTotal, MIN_CACHE_FETCH);
            const effectiveLimit = Math.min(desired, MAX_CACHE_FETCH);
            maxCachedItemsByAccount.current[accountEmail] = Math.max(maxCachedItemsByAccount.current[accountEmail] ?? 0, effectiveLimit, Math.min(knownTotal, MAX_CACHE_FETCH));
            const cached = await invoke("list_recent_messages", {
                email: accountEmail,
                limit: effectiveLimit
            });
            maxCachedItemsByAccount.current[accountEmail] = Math.max(maxCachedItemsByAccount.current[accountEmail] ?? 0, cached.length, Math.min(knownTotal, MAX_CACHE_FETCH));
            setEmailsByAccount((prev) => ({
                ...prev,
                [accountEmail]: cached
            }));
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, []);
    const recordCachedCount = useCallback((accountEmail, count) => {
        cachedCountRef.current = {
            ...cachedCountRef.current,
            [accountEmail]: count
        };
        setCachedCountsByAccount(cachedCountRef.current);
        const capped = Math.min(count, MAX_CACHE_FETCH);
        maxCachedItemsByAccount.current[accountEmail] = Math.max(maxCachedItemsByAccount.current[accountEmail] ?? 0, capped, MIN_CACHE_FETCH);
    }, []);
    const loadCachedCount = useCallback(async (accountEmail) => {
        try {
            const count = await invoke("cached_message_count", { email: accountEmail });
            recordCachedCount(accountEmail, count);
            return count;
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
            return undefined;
        }
    }, [recordCachedCount]);
    useEffect(() => {
        let mounted = true;
        let cleanup;
        const register = async () => {
            cleanup = await appWindow.listen("full-sync-progress", (event) => {
                if (!mounted || !event.payload) {
                    return;
                }
                const payload = event.payload;
                setSyncProgressByAccount((prev) => ({
                    ...prev,
                    [payload.email]: payload
                }));
                if (selectedAccount === payload.email && payload.total_batches > 0) {
                    const percent = Math.min(100, Math.round((payload.batch / payload.total_batches) * 100));
                    setInfo(`Full sync in progress… ${percent}% (${payload.fetched.toLocaleString()} messages)`);
                    const progressLimit = Math.max(maxCachedItemsByAccount.current[payload.email] ?? 0, payload.total_batches > 0 ? payload.total_batches * 50 : payload.fetched, MIN_CACHE_FETCH);
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
    const handleInputChange = (key, value) => {
        setFormState((prev) => ({ ...prev, [key]: value }));
    };
    const loadSenderGroups = useCallback(async (accountEmail) => {
        setIsLoadingGroups(true);
        try {
            const groups = await invoke("list_sender_groups", {
                email: accountEmail
            });
            setSenderGroupsByAccount((prev) => ({
                ...prev,
                [accountEmail]: groups
            }));
            if (groups.length > 0 && !expandedSenders[accountEmail]) {
                setExpandedSenders((prev) => ({
                    ...prev,
                    [accountEmail]: groups[0].sender_email
                }));
            }
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setIsLoadingGroups(false);
        }
    }, [expandedSenders]);
    const refreshEmailsForAccount = useCallback(async (accountEmail, limit = 25, showToast = true) => {
        const account = accounts.find((acct) => acct.email === accountEmail);
        if (!account) {
            return;
        }
        if (showToast) {
            setInfo("Checking for new mail...");
        }
        setError(null);
        try {
            const report = await invoke("sync_account_incremental", {
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
                    setInfo(`Fetched ${report.fetched} new message${report.fetched === 1 ? "" : "s"}.`);
                }
                else {
                    setInfo("Mailbox is up to date.");
                }
            }
            const existingCount = maxCachedItemsByAccount.current[account.email] ?? 0;
            const fetchLimit = Math.max(limit, existingCount, MIN_CACHE_FETCH);
            await loadCachedEmails(account.email, fetchLimit);
            await loadSenderGroups(account.email);
            await loadCachedCount(account.email);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [accounts, loadCachedEmails, loadSenderGroups, loadCachedCount]);
    // Periodic polling for emails every 30 seconds
    useEffect(() => {
        if (!selectedAccount)
            return;
        const interval = setInterval(() => {
            const periodicLimit = Math.max(maxCachedItemsByAccount.current[selectedAccount] ?? 0, MIN_CACHE_FETCH);
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
            const payload = await invoke("connect_account", {
                provider: formState.provider,
                email: formState.email,
                password: formState.password,
                customHost: formState.customHost || undefined,
                customPort: formState.customPort ? parseInt(formState.customPort) : undefined
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
            maxCachedItemsByAccount.current[payload.account.email] = Math.max(payload.emails.length, MIN_CACHE_FETCH);
            await loadSenderGroups(payload.account.email);
            await loadCachedCount(payload.account.email);
            setSelectedAccount(payload.account.email);
            setActiveTab("senders");
            setInfo(`Connected to ${providerLabels[payload.account.provider]} as ${payload.account.email}`);
            setFormState(initialFormState);
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
        await refreshEmailsForAccount(selectedAccount);
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
                const next = { ...prev };
                delete next[email];
                return next;
            });
            setSenderGroupsByAccount((prev) => {
                const next = { ...prev };
                delete next[email];
                return next;
            });
            setExpandedSenders((prev) => {
                const next = { ...prev };
                delete next[email];
                return next;
            });
            delete maxCachedItemsByAccount.current[email];
            const nextCountMap = { ...cachedCountRef.current };
            delete nextCountMap[email];
            cachedCountRef.current = nextCountMap;
            setCachedCountsByAccount(nextCountMap);
            setSyncReports((prev) => {
                const next = { ...prev };
                delete next[email];
                return next;
            });
            setPeriodicMinutesByAccount((prev) => {
                const next = { ...prev };
                delete next[email];
                return next;
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
    const handleFullSync = async () => {
        if (!selectedAccount) {
            return;
        }
        const account = accounts.find((acct) => acct.email === selectedAccount);
        if (!account) {
            return;
        }
        setError(null);
        setInfo("Running full mailbox sync...");
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
            const report = await invoke("sync_account_full", {
                provider: account.provider,
                email: account.email,
                chunk_size: 50
            });
            setSyncReports((prev) => ({
                ...prev,
                [account.email]: report
            }));
            setInfo(`Fetched ${report.fetched} messages (${report.stored} stored) in ${(report.duration_ms / 1000).toFixed(1)}s.`);
            const fetchLimit = Math.max(report.stored, maxCachedItemsByAccount.current[account.email] ?? 0, MIN_CACHE_FETCH);
            await loadCachedEmails(account.email, fetchLimit);
            await loadSenderGroups(account.email);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setIsSyncing(false);
            setSyncProgressByAccount((prev) => ({
                ...prev,
                [account.email]: null
            }));
        }
    };
    const handleSenderStatusChange = async (senderEmail, status) => {
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
            setSenderGroupsByAccount((prev) => {
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
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setStatusUpdating(null);
        }
    };
    const handleDeleteMessage = async (senderEmail, uid) => {
        if (!selectedAccount) {
            return;
        }
        const account = accounts.find((acct) => acct.email === selectedAccount);
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
            setSenderGroupsByAccount((prev) => {
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
            setEmailsByAccount((prev) => {
                const current = prev[selectedAccount] ?? [];
                return {
                    ...prev,
                    [selectedAccount]: current.filter((message) => message.uid !== uid)
                };
            });
            setInfo("Message deleted from the server and local cache.");
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setPendingDeleteUid(null);
        }
    };
    const handlePeriodicMinutesChange = (value) => {
        if (!selectedAccount) {
            return;
        }
        setPeriodicMinutesByAccount((prev) => ({
            ...prev,
            [selectedAccount]: value
        }));
    };
    const handleSavePeriodicSync = async () => {
        if (!selectedAccount) {
            return;
        }
        const account = accounts.find((acct) => acct.email === selectedAccount);
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
            }
            else {
                setInfo("Periodic sync disabled.");
            }
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setIsSavingPeriodic(false);
        }
    };
    const handleApplyBlockFilter = async () => {
        if (!selectedAccount) {
            return;
        }
        const account = accounts.find((acct) => acct.email === selectedAccount);
        if (!account) {
            return;
        }
        setIsApplyingBlockFilter(true);
        setError(null);
        try {
            const moved = await invoke("apply_block_filter", {
                provider: account.provider,
                email: account.email,
                target_folder: blockFolder.trim() ? blockFolder.trim() : null
            });
            await refreshEmailsForAccount(account.email, 25, false);
            await loadSenderGroups(account.email);
            if (moved > 0) {
                setInfo(`Moved ${moved} message${moved === 1 ? "" : "s"} to ${blockFolder || "the blocked folder"}.`);
            }
            else {
                setInfo("No messages matched the blocked list.");
            }
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
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
                if (cancelled)
                    return;
                const cappedTotal = count ? Math.min(count, MAX_CACHE_FETCH) : 0;
                const initialFetchLimit = Math.max(cappedTotal, maxCachedItemsByAccount.current[selectedAccount] ?? 0, 2000, MIN_CACHE_FETCH);
                await loadCachedEmails(selectedAccount, initialFetchLimit);
                if (cancelled)
                    return;
                await loadSenderGroups(selectedAccount);
                if (cancelled)
                    return;
                await refreshEmailsForAccount(selectedAccount, initialFetchLimit, false);
            }
            catch (err) {
                console.error("Failed to bootstrap account cache", err);
            }
        };
        bootstrap();
        return () => {
            cancelled = true;
        };
    }, [selectedAccount, loadCachedCount, loadCachedEmails, loadSenderGroups, refreshEmailsForAccount]);
    const toggleSenderExpansion = (senderEmail) => {
        if (!selectedAccount) {
            return;
        }
        setExpandedSenders((prev) => {
            const current = prev[selectedAccount] ?? null;
            return {
                ...prev,
                [selectedAccount]: current === senderEmail ? null : senderEmail
            };
        });
    };
    const statusLabel = (status) => {
        switch (status) {
            case "allowed":
                return "Allowed";
            case "blocked":
                return "Blocked";
            default:
                return "Neutral";
        }
    };
    const formatDate = (value) => {
        if (!value) {
            return "";
        }
        return dayjs(value).format("MMM D, YYYY h:mm A");
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { children: "Yahoo Mail Client" }), _jsx("p", { className: "subtitle", children: "Connect using Yahoo app passwords over TLS." }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Add Account" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Provider" }), _jsx("select", { value: formState.provider, onChange: (event) => handleInputChange("provider", event.target.value), children: Object.entries(providerLabels).map(([key, label]) => (_jsx("option", { value: key, children: label }, key))) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { type: "email", autoComplete: "username", placeholder: "your.email@example.com", value: formState.email, onChange: (event) => handleInputChange("email", event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Password" }), _jsx("input", { type: "password", autoComplete: "current-password", placeholder: "App password or server password", value: formState.password, onChange: (event) => handleInputChange("password", event.target.value) }), _jsx("small", { className: "hint", children: "For Yahoo: Generate via Account Security \u2192 Manage app passwords \u2192 Mail" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Custom IMAP Host (optional)" }), _jsx("input", { type: "text", placeholder: "e.g., imap.example.com", value: formState.customHost || "", onChange: (event) => handleInputChange("customHost", event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Custom IMAP Port (optional)" }), _jsx("input", { type: "number", placeholder: "993", value: formState.customPort || "993", onChange: (event) => handleInputChange("customPort", event.target.value) })] }), _jsx("button", { type: "button", className: "primary", onClick: submitConnect, disabled: isSubmitting || !formState.email || !formState.password, children: isSubmitting ? "Connecting..." : "Connect" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Connected accounts" }), accounts.length === 0 ? (_jsx("p", { className: "empty", children: "No accounts connected yet." })) : (_jsx("ul", { className: "account-list", children: accounts.map((account) => (_jsxs("li", { className: "account-row", children: [_jsxs("button", { type: "button", className: account.email === selectedAccount ? "link active" : "link", onClick: () => setSelectedAccount(account.email), children: [_jsx("span", { className: "provider", children: providerLabels[account.provider] }), _jsx("span", { children: account.email })] }), _jsx("button", { type: "button", className: "icon-button", onClick: (event) => {
                                                event.stopPropagation();
                                                disconnectAccount(account.email);
                                            }, disabled: removingAccount === account.email, "aria-label": `Disconnect ${account.email}`, children: removingAccount === account.email ? "…" : "✕" })] }, account.email))) }))] })] }), _jsxs("main", { className: "content", children: [error && _jsx("div", { className: "alert error", children: error }), info && _jsx("div", { className: "alert info", children: info }), selectedAccount ? (_jsxs("div", { className: "mailbox", children: [_jsxs("header", { className: "mailbox-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedAccount }), _jsxs("p", { className: "mailbox-subtitle", children: ["Connected via ", providerLabels[accounts.find((acct) => acct.email === selectedAccount)?.provider ?? ACCOUNT_PROVIDER]] })] }), _jsxs("div", { className: "mailbox-actions", children: [_jsx("button", { type: "button", className: "link", onClick: refreshEmails, children: "Refresh recent" }), _jsx("button", { type: "button", className: "link", onClick: handleFullSync, disabled: isSyncing, children: isSyncing ? "Syncing…" : "Full sync" })] })] }), _jsxs("div", { className: "mailbox-stats", role: "status", "aria-live": "polite", children: [_jsxs("span", { children: [_jsx("strong", { children: currentEmails.length.toLocaleString() }), totalCachedCount > currentEmails.length
                                                ? ` of ${totalCachedCount.toLocaleString()}`
                                                : "", " ", "cached message", totalCachedCount === 1 ? "" : "s"] }), syncReport ? (_jsxs("span", { children: ["Last full sync stored ", _jsx("strong", { children: syncReport.stored.toLocaleString() }), " • ", "fetched ", syncReport.fetched.toLocaleString()] })) : null, syncProgress && syncProgress.total_batches > 0 ? (_jsxs("span", { children: ["Batch ", syncProgress.batch, "/", syncProgress.total_batches, " (", syncProgress.fetched.toLocaleString(), " fetched)"] })) : null] }), syncProgress && syncProgress.total_batches > 0 ? (_jsx("div", { className: "sync-progress-bar", "aria-hidden": "true", children: _jsx("div", { className: "sync-progress-value", style: { width: `${Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))}%` } }) })) : null, _jsx("nav", { className: "tab-bar", "aria-label": "Mailbox views", children: tabs.map((tab) => (_jsxs("button", { type: "button", className: clsx("tab", { active: activeTab === tab.key }), onClick: () => setActiveTab(tab.key), children: [_jsx("span", { children: tab.label }), _jsx("small", { children: tab.description })] }, tab.key))) }), _jsxs("section", { className: "tab-panel", "aria-live": "polite", children: [activeTab === "recent" && (_jsx("div", { className: "tab-content", children: currentEmails.length === 0 ? (_jsx("p", { className: "empty", children: "No messages in the last fetch window." })) : (_jsx("ul", { className: "email-list", children: currentEmails.map((email) => (_jsxs("li", { children: [_jsx("div", { className: "email-subject", children: email.subject || "(No subject)" }), _jsxs("div", { className: "email-meta", children: [_jsx("span", { children: email.sender.display_name ?? email.sender.email }), email.date && _jsx("span", { children: formatDate(email.date) })] })] }, email.uid))) })) })), activeTab === "senders" && (_jsx("div", { className: "tab-content", children: isLoadingGroups ? (_jsx("p", { className: "empty", children: "Loading sender groups\u2026" })) : currentSenderGroups.length === 0 ? (_jsx("p", { className: "empty", children: "No cached messages yet. Try a full sync." })) : (_jsx("div", { className: "sender-groups", children: currentSenderGroups.map((group) => {
                                                const isExpanded = expandedSenderForAccount === group.sender_email;
                                                return (_jsxs("div", { className: clsx("sender-group", `status-${group.status}`), children: [_jsxs("button", { type: "button", className: "sender-header", onClick: () => toggleSenderExpansion(group.sender_email), children: [_jsxs("div", { className: "sender-ident", children: [_jsx("h3", { children: group.sender_display }), _jsx("span", { className: "sender-email", children: group.sender_email })] }), _jsxs("div", { className: "sender-meta", children: [_jsx("span", { className: clsx("status-pill", group.status), children: statusLabel(group.status) }), _jsxs("span", { className: "sender-count", children: [group.message_count, " message", group.message_count === 1 ? "" : "s"] })] })] }), _jsx("div", { className: "status-actions", children: ["allowed", "neutral", "blocked"].map((status) => (_jsx("button", { type: "button", className: clsx("status-button", status, {
                                                                    active: group.status === status
                                                                }), onClick: () => handleSenderStatusChange(group.sender_email, status), disabled: statusUpdating === group.sender_email || group.status === status, children: statusLabel(status) }, status))) }), isExpanded && (_jsx("div", { className: "message-list", children: group.messages.map((message) => {
                                                                const deleteKey = `${group.sender_email}::${message.uid}`;
                                                                return (_jsxs("article", { className: "message-card", children: [_jsxs("header", { children: [_jsx("h4", { children: message.subject || "(No subject)" }), _jsx("span", { className: "message-date", children: formatDate(message.date) })] }), message.analysis_sentiment && (_jsxs("span", { className: clsx("sentiment", message.analysis_sentiment), children: ["Sentiment: ", message.analysis_sentiment] })), _jsx("p", { className: "message-snippet", children: message.analysis_summary ?? message.snippet ?? "No preview available." }), message.analysis_categories.length > 0 && (_jsx("div", { className: "category-row", children: message.analysis_categories.map((category) => (_jsx("span", { className: "category-chip", children: category }, category))) })), _jsxs("footer", { className: "message-actions", children: [message.flags && _jsxs("span", { className: "flags", children: ["Flags: ", message.flags] }), _jsx("button", { type: "button", className: "outline", onClick: () => handleDeleteMessage(group.sender_email, message.uid), disabled: pendingDeleteUid === deleteKey, children: pendingDeleteUid === deleteKey ? "Deleting…" : "Delete" })] })] }, message.uid));
                                                            }) }))] }, group.sender_email));
                                            }) })) })), activeTab === "automation" && (_jsxs("div", { className: "tab-content automation-grid", children: [_jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Periodic sync" }), _jsx("p", { children: "Keep this mailbox fresh by syncing on a schedule." }), _jsxs("label", { className: "field inline", children: [_jsx("span", { children: "Interval (minutes)" }), _jsx("input", { type: "number", min: 0, step: 5, value: periodicMinutes, onChange: (event) => handlePeriodicMinutesChange(Number(event.target.value) || 0) })] }), _jsx("button", { type: "button", className: "primary", onClick: handleSavePeriodicSync, disabled: isSavingPeriodic, children: isSavingPeriodic ? "Saving…" : periodicMinutes > 0 ? "Enable" : "Disable" }), _jsx("small", { className: "hint", children: "Set to 0 to turn off periodic syncing." })] }), _jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Blocked sender filter" }), _jsx("p", { children: "Move messages from blocked senders to a safer folder." }), _jsxs("label", { className: "field inline", children: [_jsx("span", { children: "Target folder" }), _jsx("input", { type: "text", value: blockFolder, onChange: (event) => setBlockFolder(event.target.value) })] }), _jsx("button", { type: "button", className: "primary", onClick: handleApplyBlockFilter, disabled: isApplyingBlockFilter, children: isApplyingBlockFilter ? "Applying…" : "Apply filter" }), _jsx("small", { className: "hint", children: "Leave blank to use the provider default \"Blocked\" folder." })] }), _jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Last full sync" }), syncReport ? (_jsxs("ul", { className: "sync-report", children: [_jsxs("li", { children: [_jsx("strong", { children: "Fetched:" }), " ", syncReport.fetched] }), _jsxs("li", { children: [_jsx("strong", { children: "Stored:" }), " ", syncReport.stored] }), _jsxs("li", { children: [_jsx("strong", { children: "Duration:" }), " ", (syncReport.duration_ms / 1000).toFixed(1), "s"] })] })) : (_jsx("p", { children: "No full sync run in this session yet." })), _jsx("button", { type: "button", className: "outline", onClick: handleFullSync, disabled: isSyncing, children: isSyncing ? "Syncing…" : "Run full sync" })] })] }))] })] })) : (_jsxs("div", { className: "placeholder", children: [_jsx("h2", { children: "Welcome!" }), _jsx("p", { children: "Connect a Yahoo account using an app password to begin syncing." })] }))] })] }));
}
