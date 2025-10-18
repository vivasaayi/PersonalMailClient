import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { createElement } from 'react';
import NavigationDrawer from "./components/NavigationDrawer";
import ConnectionWizard from "./components/ConnectionWizard";
import Mailbox from "./components/Mailbox";
import SettingsView from "./components/SettingsView";
import AutomationView from "./components/AutomationView";
const providerLabels = {
    gmail: "Gmail",
    outlook: "Outlook / Live",
    yahoo: "Yahoo Mail",
    custom: "Custom IMAP"
};
const MIN_CACHE_FETCH = 1000;
const MAX_CACHE_FETCH = 50000;
export default function App() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [emailsByAccount, setEmailsByAccount] = useState({});
    const [cachedCountsByAccount, setCachedCountsByAccount] = useState({});
    const [senderGroupsByAccount, setSenderGroupsByAccount] = useState({});
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
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
    const maxCachedItemsByAccount = useRef({});
    const cachedCountRef = useRef({});
    const emailListRef = useRef(null);
    // Navigation state
    const [drawerOpen, setDrawerOpen] = useState(true);
    const [currentView, setCurrentView] = useState('mailbox');
    const [connectionWizardOpen, setConnectionWizardOpen] = useState(false);
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
        try {
            const saved = await invoke("list_saved_accounts");
            setSavedAccounts(saved);
        }
        catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : String(err));
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
    const periodicMinutes = selectedAccount
        ? periodicMinutesByAccount[selectedAccount] ?? 0
        : 0;
    const syncReport = selectedAccount ? syncReports[selectedAccount] ?? null : null;
    const syncProgress = selectedAccount ? syncProgressByAccount[selectedAccount] ?? null : null;
    const totalCachedCount = selectedAccount
        ? cachedCountsByAccount[selectedAccount] ?? currentEmails.length
        : currentEmails.length;
    const loadSenderGroups = useCallback(async (accountEmail) => {
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
    const connectSavedAccount = async (saved) => {
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
    const refreshEmails = async () => {
        if (!selectedAccount) {
            return;
        }
        await refreshEmailsForAccount(selectedAccount);
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
    // Navigation handlers
    const handleDrawerToggle = () => {
        setDrawerOpen(!drawerOpen);
    };
    const handleNavigate = (view) => {
        setCurrentView(view);
    };
    const handleOpenConnectionWizard = () => {
        setConnectionWizardOpen(true);
    };
    const handleCloseConnectionWizard = () => {
        setConnectionWizardOpen(false);
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
    const handleInfoClose = (_event, reason) => {
        if (reason === "clickaway") {
            return;
        }
        setInfo(null);
    };
    return createElement('div', { style: { display: 'flex', height: '100vh' } }, [
        // Navigation Drawer
        createElement(NavigationDrawer, {
            key: 'nav-drawer',
            open: drawerOpen,
            accounts: accounts,
            selectedAccount: selectedAccount,
            onAccountSelect: setSelectedAccount,
            onNavigate: handleNavigate,
            currentView: currentView
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
                // Error Alert
                error && createElement('div', {
                    key: 'error-alert',
                    style: {
                        margin: '16px',
                        padding: '12px 16px',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center'
                    }
                }, [
                    createElement('span', { key: 'error-icon', style: { marginRight: '8px' } }, '⚠️'),
                    error
                ]),
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
                    expandedSenderForAccount: expandedSenders[selectedAccount] || null,
                    onToggleExpansion: toggleSenderExpansion,
                    onStatusChange: (senderEmail, status) => handleSenderStatusChange(senderEmail, status),
                    statusUpdating: statusUpdating,
                    onDeleteMessage: handleDeleteMessage,
                    pendingDeleteUid: pendingDeleteUid
                }) : currentView === 'automation' && selectedAccount ? createElement(AutomationView, {
                    key: 'automation-view',
                    periodicMinutes: periodicMinutes,
                    onPeriodicMinutesChange: handlePeriodicMinutesChange,
                    onSavePeriodicSync: handleSavePeriodicSync,
                    isSavingPeriodic: isSavingPeriodic,
                    blockFolder: blockFolder,
                    onBlockFolderChange: setBlockFolder,
                    onApplyBlockFilter: handleApplyBlockFilter,
                    isApplyingBlockFilter: isApplyingBlockFilter,
                    syncReport: syncReport,
                    onFullSync: handleFullSync,
                    isSyncing: isSyncing
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
                    createElement(ButtonComponent, {
                        key: 'connect-button',
                        cssClass: 'primary large',
                        content: '+ Connect Account',
                        onClick: handleOpenConnectionWizard
                    })
                ])
            ])
        ]),
        // Info Snackbar
        info && createElement('div', {
            key: 'info-snackbar',
            style: {
                position: 'fixed',
                top: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '6px',
                zIndex: 1300,
                display: 'flex',
                alignItems: 'center'
            }
        }, [
            createElement('span', { key: 'info-icon', style: { marginRight: '8px' } }, 'ℹ️'),
            info,
            createElement('button', {
                key: 'close-info',
                style: { marginLeft: '16px', background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' },
                onClick: handleInfoClose
            }, '×')
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
            onConnect: async (formData) => {
                setError(null);
                setInfo(null);
                setIsSubmitting(true);
                try {
                    const payload = await invoke("connect_account", {
                        provider: formData.provider,
                        email: formData.email,
                        password: formData.password,
                        customHost: formData.customHost || undefined,
                        customPort: formData.customPort ? formData.customPort : undefined
                    });
                    await applyConnectResponse(payload);
                    await loadSavedAccounts();
                    setInfo(`Connected to ${providerLabels[payload.account.provider]} as ${payload.account.email}`);
                }
                catch (err) {
                    console.error(err);
                    setError(err instanceof Error ? err.message : String(err));
                }
                finally {
                    setIsSubmitting(false);
                }
            },
            onConnectSaved: connectSavedAccount,
            savedAccounts: savedAccounts,
            isSubmitting: isSubmitting,
            prefillingSavedEmail: null,
            connectingSavedEmail: connectingSavedEmail
        })
    ]);
}
