import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
// Custom cell renderer for status buttons
const StatusButtonRenderer = (props) => {
    const { data, onStatusChange, statusUpdating } = props;
    const statuses = ["allowed", "neutral", "blocked"];
    return (_jsx("div", { className: "status-actions", children: statuses.map((status) => (_jsx("button", { type: "button", className: clsx("status-button", status, {
                active: data.status === status
            }), onClick: () => onStatusChange(data.sender_email, status), disabled: statusUpdating === data.sender_email || data.status === status, children: statusLabel(status) }, status))) }));
};
// Custom cell renderer for sender info
const SenderInfoRenderer = (props) => {
    const { data, onToggleExpansion, isExpanded } = props;
    return (_jsxs("button", { type: "button", className: "sender-header", onClick: () => onToggleExpansion(data.sender_email), style: { width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer' }, children: [_jsxs("div", { className: "sender-ident", children: [_jsx("h3", { children: data.sender_display }), _jsx("span", { className: "sender-email", children: data.sender_email })] }), _jsxs("div", { className: "sender-meta", children: [_jsx("span", { className: clsx("status-pill", data.status), children: statusLabel(data.status) }), _jsxs("span", { className: "sender-count", children: [data.message_count, " message", data.message_count === 1 ? "" : "s"] })] })] }));
};
export default function App() {
    const [formState, setFormState] = useState(initialFormState);
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [emailsByAccount, setEmailsByAccount] = useState({});
    const [cachedCountsByAccount, setCachedCountsByAccount] = useState({});
    const [senderGroupsByAccount, setSenderGroupsByAccount] = useState({});
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingSavedAccounts, setIsLoadingSavedAccounts] = useState(false);
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
    const [connectingSavedEmail, setConnectingSavedEmail] = useState(null);
    const [prefillingSavedEmail, setPrefillingSavedEmail] = useState(null);
    const maxCachedItemsByAccount = useRef({});
    const cachedCountRef = useRef({});
    const emailListRef = useRef(null);
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
            // Capture scroll position before updating
            const scrollTop = emailListRef.current?.scrollTop ?? 0;
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
            // Restore scroll position after state update
            requestAnimationFrame(() => {
                if (emailListRef.current) {
                    emailListRef.current.scrollTop = scrollTop;
                }
            });
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
    const loadSavedAccounts = useCallback(async () => {
        setIsLoadingSavedAccounts(true);
        try {
            const saved = await invoke("list_saved_accounts");
            setSavedAccounts(saved);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
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
    const loadSenderGroups = useCallback(async (accountEmail, options = {}) => {
        const { showLoading = true } = options;
        if (showLoading) {
            setIsLoadingGroups(true);
        }
        try {
            const groups = await invoke("list_sender_groups", {
                email: accountEmail
            });
            setSenderGroupsByAccount((prev) => {
                const existing = prev[accountEmail] ?? [];
                const unchanged = existing.length === groups.length &&
                    existing.every((group, index) => {
                        const next = groups[index];
                        if (!next)
                            return false;
                        const sameMeta = group.sender_email === next.sender_email &&
                            group.status === next.status &&
                            group.message_count === next.message_count &&
                            group.messages.length === next.messages.length;
                        if (!sameMeta) {
                            return false;
                        }
                        // compare message metadata without deep diffing the whole payload
                        return group.messages.every((msg, msgIdx) => {
                            const nextMsg = next.messages[msgIdx];
                            if (!nextMsg)
                                return false;
                            return (msg.uid === nextMsg.uid &&
                                msg.subject === nextMsg.subject &&
                                msg.date === nextMsg.date &&
                                msg.snippet === nextMsg.snippet &&
                                msg.analysis_summary === nextMsg.analysis_summary &&
                                msg.analysis_sentiment === nextMsg.analysis_sentiment);
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
            if (showLoading) {
                setIsLoadingGroups(false);
            }
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
            await loadSenderGroups(account.email, { showLoading: showToast });
            await loadCachedCount(account.email);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [accounts, loadCachedEmails, loadSenderGroups, loadCachedCount]);
    const applyConnectResponse = useCallback(async (payload) => {
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
    }, [loadSenderGroups, loadCachedCount]);
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
            await applyConnectResponse(payload);
            await loadSavedAccounts();
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
    const connectSavedAccount = async (saved) => {
        if (!saved.has_password) {
            await prefillSavedAccount(saved);
            return;
        }
        setError(null);
        setInfo(null);
        setConnectingSavedEmail(saved.email);
        try {
            const payload = await invoke("connect_account_saved", {
                provider: saved.provider,
                email: saved.email
            });
            await applyConnectResponse(payload);
            await loadSavedAccounts();
            setInfo(`Reconnected ${payload.account.email} using saved macOS keychain credentials.`);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setConnectingSavedEmail(null);
        }
    };
    const prefillSavedAccount = async (saved) => {
        setError(null);
        setInfo(null);
        setPrefillingSavedEmail(saved.email);
        try {
            let password = "";
            let message = null;
            if (saved.has_password) {
                const fetched = await invoke("get_saved_password", {
                    email: saved.email
                });
                if (fetched) {
                    password = fetched;
                    message = "Loaded password from macOS keychain. Review and connect.";
                }
                else {
                    message = "No password found in macOS keychain. Enter it to reconnect.";
                }
            }
            else {
                message = "Password isn't stored for this account. Enter it to reconnect.";
            }
            setFormState({
                provider: saved.provider,
                email: saved.email,
                password,
                customHost: saved.custom_host ?? "",
                customPort: saved.custom_port != null
                    ? String(saved.custom_port)
                    : saved.provider === "custom"
                        ? ""
                        : initialFormState.customPort
            });
            if (message) {
                setInfo(message);
            }
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setPrefillingSavedEmail(null);
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
            await loadSavedAccounts();
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
            await loadSenderGroups(account.email, { showLoading: false });
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
                await loadSenderGroups(selectedAccount, {
                    showLoading: (senderGroupsByAccount[selectedAccount]?.length ?? 0) === 0
                });
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
    }, [selectedAccount, loadCachedCount, loadCachedEmails, loadSenderGroups, refreshEmailsForAccount, senderGroupsByAccount]);
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
    // Memoize AG Grid column definitions to prevent unnecessary re-renders
    const columnDefs = useMemo(() => [
        {
            field: 'sender_display',
            headerName: 'Sender',
            cellRenderer: SenderInfoRenderer,
            cellRendererParams: {
                onToggleExpansion: toggleSenderExpansion,
                isExpanded: (data) => expandedSenderForAccount === data.sender_email
            },
            flex: 2,
            minWidth: 250
        },
        {
            field: 'message_count',
            headerName: 'Messages',
            valueFormatter: (params) => `${params.value} message${params.value === 1 ? '' : 's'}`,
            width: 120
        },
        {
            field: 'status',
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
    const formatDate = (value) => {
        if (!value) {
            return "";
        }
        return dayjs(value).format("MMM D, YYYY h:mm A");
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { children: "Yahoo Mail Client" }), _jsx("p", { className: "subtitle", children: "Connect using Yahoo app passwords over TLS." }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Add Account" }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Provider" }), _jsx("select", { value: formState.provider, onChange: (event) => handleInputChange("provider", event.target.value), children: Object.entries(providerLabels).map(([key, label]) => (_jsx("option", { value: key, children: label }, key))) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { type: "email", autoComplete: "username", placeholder: "your.email@example.com", value: formState.email, onChange: (event) => handleInputChange("email", event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Password" }), _jsx("input", { type: "password", autoComplete: "current-password", placeholder: "App password or server password", value: formState.password, onChange: (event) => handleInputChange("password", event.target.value) }), _jsx("small", { className: "hint", children: "For Yahoo: Generate via Account Security \u2192 Manage app passwords \u2192 Mail" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Custom IMAP Host (optional)" }), _jsx("input", { type: "text", placeholder: "e.g., imap.example.com", value: formState.customHost || "", onChange: (event) => handleInputChange("customHost", event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Custom IMAP Port (optional)" }), _jsx("input", { type: "number", placeholder: "993", value: formState.customPort || "993", onChange: (event) => handleInputChange("customPort", event.target.value) })] }), _jsx("button", { type: "button", className: "primary", onClick: submitConnect, disabled: isSubmitting || !formState.email || !formState.password, children: isSubmitting ? "Connecting..." : "Connect" }), _jsxs("div", { className: "saved-accounts", children: [_jsxs("div", { className: "saved-accounts-header", children: [_jsx("h3", { children: "Saved on this Mac" }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => loadSavedAccounts(), disabled: isLoadingSavedAccounts, children: isLoadingSavedAccounts ? "Refreshing..." : "Refresh" })] }), isLoadingSavedAccounts ? (_jsx("p", { className: "muted", children: "Loading saved accounts..." })) : savedAccounts.length === 0 ? (_jsx("p", { className: "muted", children: "Saved accounts appear after you connect once and grant keychain access." })) : (_jsx("ul", { className: "saved-account-list", children: savedAccounts.map((saved) => (_jsxs("li", { className: "saved-account-row", children: [_jsxs("div", { className: "saved-account-details", children: [_jsx("span", { className: "provider", children: providerLabels[saved.provider] }), _jsx("span", { className: "saved-account-email", children: saved.email }), !saved.has_password && (_jsx("span", { className: "badge warning", children: "Password needed" }))] }), _jsxs("div", { className: "saved-account-actions", children: [_jsx("button", { type: "button", className: "ghost-button", onClick: () => prefillSavedAccount(saved), disabled: prefillingSavedEmail === saved.email ||
                                                                connectingSavedEmail === saved.email, children: prefillingSavedEmail === saved.email ? "Filling..." : "Fill form" }), _jsx("button", { type: "button", className: "primary", onClick: () => connectSavedAccount(saved), disabled: !saved.has_password || connectingSavedEmail === saved.email, children: connectingSavedEmail === saved.email ? "Connecting..." : "Connect" })] })] }, saved.email))) }))] })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Connected accounts" }), accounts.length === 0 ? (_jsx("p", { className: "empty", children: "No accounts connected yet." })) : (_jsx("ul", { className: "account-list", children: accounts.map((account) => (_jsxs("li", { className: "account-row", children: [_jsxs("button", { type: "button", className: account.email === selectedAccount ? "link active" : "link", onClick: () => setSelectedAccount(account.email), children: [_jsx("span", { className: "provider", children: providerLabels[account.provider] }), _jsx("span", { children: account.email })] }), _jsx("button", { type: "button", className: "icon-button", onClick: (event) => {
                                                event.stopPropagation();
                                                disconnectAccount(account.email);
                                            }, disabled: removingAccount === account.email, "aria-label": `Disconnect ${account.email}`, children: removingAccount === account.email ? "…" : "✕" })] }, account.email))) }))] })] }), _jsxs("main", { className: "content", ref: emailListRef, children: [error && _jsx("div", { className: "alert error", children: error }), info && _jsx("div", { className: "alert info", children: info }), selectedAccount ? (_jsxs("div", { className: "mailbox", children: [_jsxs("header", { className: "mailbox-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedAccount }), _jsxs("p", { className: "mailbox-subtitle", children: ["Connected via ", providerLabels[accounts.find((acct) => acct.email === selectedAccount)?.provider ?? ACCOUNT_PROVIDER]] })] }), _jsxs("div", { className: "mailbox-actions", children: [_jsx("button", { type: "button", className: "link", onClick: refreshEmails, children: "Refresh recent" }), _jsx("button", { type: "button", className: "link", onClick: handleFullSync, disabled: isSyncing, children: isSyncing ? "Syncing…" : "Full sync" })] })] }), _jsxs("div", { className: "mailbox-stats", role: "status", "aria-live": "polite", children: [_jsxs("span", { children: [_jsx("strong", { children: currentEmails.length.toLocaleString() }), totalCachedCount > currentEmails.length
                                                ? ` of ${totalCachedCount.toLocaleString()}`
                                                : "", " ", "cached message", totalCachedCount === 1 ? "" : "s"] }), syncReport ? (_jsxs("span", { children: ["Last full sync stored ", _jsx("strong", { children: syncReport.stored.toLocaleString() }), " • ", "fetched ", syncReport.fetched.toLocaleString()] })) : null, syncProgress && syncProgress.total_batches > 0 ? (_jsxs("span", { children: ["Batch ", syncProgress.batch, "/", syncProgress.total_batches, " (", syncProgress.fetched.toLocaleString(), " fetched)"] })) : null] }), syncProgress && syncProgress.total_batches > 0 ? (_jsx("div", { className: "sync-progress-bar", "aria-hidden": "true", children: _jsx("div", { className: "sync-progress-value", style: { width: `${Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))}%` } }) })) : null, _jsx("nav", { className: "tab-bar", "aria-label": "Mailbox views", children: tabs.map((tab) => (_jsxs("button", { type: "button", className: clsx("tab", { active: activeTab === tab.key }), onClick: () => setActiveTab(tab.key), children: [_jsx("span", { children: tab.label }), _jsx("small", { children: tab.description })] }, tab.key))) }), _jsxs("section", { className: "tab-panel", "aria-live": "polite", children: [activeTab === "recent" && (_jsx("div", { className: "tab-content", children: currentEmails.length === 0 ? (_jsx("p", { className: "empty", children: "No messages in the last fetch window." })) : (_jsx("ul", { className: "email-list", children: currentEmails.map((email) => (_jsxs("li", { children: [_jsx("div", { className: "email-subject", children: email.subject || "(No subject)" }), _jsxs("div", { className: "email-meta", children: [_jsx("span", { children: email.sender.display_name ?? email.sender.email }), email.date && _jsx("span", { children: formatDate(email.date) })] })] }, email.uid))) })) })), activeTab === "senders" && (_jsx("div", { className: "tab-content", children: isLoadingGroups ? (_jsx("p", { className: "empty", children: "Loading sender groups\u2026" })) : currentSenderGroups.length === 0 ? (_jsx("p", { className: "empty", children: "No cached messages yet. Try a full sync." })) : (_jsx("div", { className: "ag-theme-alpine", style: { height: '600px', width: '100%' }, children: _jsx(AgGridReact, { rowData: currentSenderGroups, columnDefs: columnDefs, defaultColDef: defaultColDef, masterDetail: true, detailRowHeight: 300, detailCellRenderer: (props) => {
                                                    const group = props.data;
                                                    return (_jsx("div", { className: "message-list", style: { padding: '10px' }, children: group.messages.map((message) => {
                                                            const deleteKey = `${group.sender_email}::${message.uid}`;
                                                            return (_jsxs("article", { className: "message-card", children: [_jsxs("header", { children: [_jsx("h4", { children: message.subject || "(No subject)" }), _jsx("span", { className: "message-date", children: formatDate(message.date) })] }), message.analysis_sentiment && (_jsxs("span", { className: clsx("sentiment", message.analysis_sentiment), children: ["Sentiment: ", message.analysis_sentiment] })), _jsx("p", { className: "message-snippet", children: message.analysis_summary ?? message.snippet ?? "No preview available." }), message.analysis_categories.length > 0 && (_jsx("div", { className: "category-row", children: message.analysis_categories.map((category) => (_jsx("span", { className: "category-chip", children: category }, category))) })), _jsxs("footer", { className: "message-actions", children: [message.flags && _jsxs("span", { className: "flags", children: ["Flags: ", message.flags] }), _jsx("button", { type: "button", className: "outline", onClick: () => handleDeleteMessage(group.sender_email, message.uid), disabled: pendingDeleteUid === deleteKey, children: pendingDeleteUid === deleteKey ? "Deleting…" : "Delete" })] })] }, message.uid));
                                                        }) }));
                                                }, onRowGroupOpened: (event) => {
                                                    // Handle expansion state
                                                    if (event.expanded && event.data) {
                                                        setExpandedSenders((prev) => ({
                                                            ...prev,
                                                            [selectedAccount]: event.data.sender_email
                                                        }));
                                                    }
                                                    else {
                                                        setExpandedSenders((prev) => ({
                                                            ...prev,
                                                            [selectedAccount]: null
                                                        }));
                                                    }
                                                }, getRowId: (params) => params.data.sender_email, animateRows: false, suppressRowClickSelection: true, suppressCellFocus: true }) })) })), activeTab === "automation" && (_jsxs("div", { className: "tab-content automation-grid", children: [_jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Periodic sync" }), _jsx("p", { children: "Keep this mailbox fresh by syncing on a schedule." }), _jsxs("label", { className: "field inline", children: [_jsx("span", { children: "Interval (minutes)" }), _jsx("input", { type: "number", min: 0, step: 5, value: periodicMinutes, onChange: (event) => handlePeriodicMinutesChange(Number(event.target.value) || 0) })] }), _jsx("button", { type: "button", className: "primary", onClick: handleSavePeriodicSync, disabled: isSavingPeriodic, children: isSavingPeriodic ? "Saving…" : periodicMinutes > 0 ? "Enable" : "Disable" }), _jsx("small", { className: "hint", children: "Set to 0 to turn off periodic syncing." })] }), _jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Blocked sender filter" }), _jsx("p", { children: "Move messages from blocked senders to a safer folder." }), _jsxs("label", { className: "field inline", children: [_jsx("span", { children: "Target folder" }), _jsx("input", { type: "text", value: blockFolder, onChange: (event) => setBlockFolder(event.target.value) })] }), _jsx("button", { type: "button", className: "primary", onClick: handleApplyBlockFilter, disabled: isApplyingBlockFilter, children: isApplyingBlockFilter ? "Applying…" : "Apply filter" }), _jsx("small", { className: "hint", children: "Leave blank to use the provider default \"Blocked\" folder." })] }), _jsxs("div", { className: "automation-card", children: [_jsx("h3", { children: "Last full sync" }), syncReport ? (_jsxs("ul", { className: "sync-report", children: [_jsxs("li", { children: [_jsx("strong", { children: "Fetched:" }), " ", syncReport.fetched] }), _jsxs("li", { children: [_jsx("strong", { children: "Stored:" }), " ", syncReport.stored] }), _jsxs("li", { children: [_jsx("strong", { children: "Duration:" }), " ", (syncReport.duration_ms / 1000).toFixed(1), "s"] })] })) : (_jsx("p", { children: "No full sync run in this session yet." })), _jsx("button", { type: "button", className: "outline", onClick: handleFullSync, disabled: isSyncing, children: isSyncing ? "Syncing…" : "Run full sync" })] })] }))] })] })) : (_jsxs("div", { className: "placeholder", children: [_jsx("h2", { children: "Welcome!" }), _jsx("p", { children: "Connect a Yahoo account using an app password to begin syncing." })] }))] })] }));
}
