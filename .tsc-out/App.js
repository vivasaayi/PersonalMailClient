import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { useAppState } from "./hooks/useAppState";
import NavigationDrawer from "./components/NavigationDrawer";
import ConnectionWizard from "./components/ConnectionWizard";
import SavedAccountsDialog from "./components/SavedAccountsDialog";
import Mailbox from "./components/Mailbox";
import SettingsView from "./components/SettingsView";
import AutomationView from "./components/AutomationView";
import AccountsView from "./components/AccountsView";
import NotificationsHost from "./components/NotificationsHost";
import BlockedSendersView from "./components/BlockedSendersView";
import BlockedDomainsView from "./components/BlockedDomainsView";
import LlmAssistantView from "./components/LlmAssistantView";
import BulkAnalysisPanel from "./components/BulkAnalysisPanel";
import DeletedEmailsView from "./components/DeletedEmailsView";
import { useBulkAnalysis } from "./stores/bulkAnalysisStore";
import { useNotifications } from "./stores/notifications";
const SYNCFUSION_BANNER_OFFSET = 72;
function GlobalProgressBar({ deleteProgress, purgeProgress, remoteDeleteProgress }) {
    const progress = deleteProgress || purgeProgress || remoteDeleteProgress;
    if (!progress)
        return null;
    let processed;
    let percent;
    let text;
    let barColor = "#dc2626";
    let detailsText = null;
    if (deleteProgress) {
        processed = deleteProgress.completed + deleteProgress.failed;
        percent = deleteProgress.total > 0 ? (processed / deleteProgress.total) * 100 : 0;
        text = `Deleting messages... ${processed} / ${deleteProgress.total}${deleteProgress.failed > 0 ? ` (${deleteProgress.failed} failed)` : ''}`;
        detailsText = deleteProgress.failed > 0 ? `${deleteProgress.completed} successful, ${deleteProgress.failed} failed` : null;
    }
    else if (purgeProgress) {
        processed = purgeProgress.completed;
        percent = purgeProgress.total > 0 ? (processed / purgeProgress.total) * 100 : 0;
        text = `Purging messages from ${purgeProgress.senderEmail}... ${processed} / ${purgeProgress.total}`;
        barColor = "#dc2626";
    }
    else if (remoteDeleteProgress) {
        const completed = remoteDeleteProgress.completed;
        const failed = remoteDeleteProgress.failed;
        const pending = remoteDeleteProgress.pending;
        processed = completed + failed;
        percent = remoteDeleteProgress.total > 0 ? (processed / remoteDeleteProgress.total) * 100 : 0;
        text = `Removing messages from server… ${processed} / ${remoteDeleteProgress.total}`;
        if (pending > 0) {
            text += ` · ${pending} remaining`;
        }
        if (failed > 0) {
            text += ` (${failed} failed)`;
            barColor = "#f59e0b";
            detailsText = `${completed} removed · ${failed} failed`;
        }
        else {
            barColor = "#34d399";
            detailsText = remoteDeleteProgress.summary ?? null;
        }
    }
    else {
        return null;
    }
    return createElement('div', {
        style: {
            position: 'fixed',
            top: `${SYNCFUSION_BANNER_OFFSET}px`,
            left: 0,
            right: 0,
            zIndex: 1200,
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            padding: '12px 24px'
        }
    }, [
        createElement('div', {
            key: 'progress-container',
            style: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '400px' }
        }, [
            createElement('div', {
                key: 'progress-text',
                style: { fontSize: '0.875rem', color: '#374151', fontWeight: '500' }
            }, text),
            createElement('div', {
                key: 'progress-bar',
                style: {
                    width: '100%',
                    height: '6px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '3px',
                    overflow: 'hidden'
                }
            }, createElement('div', {
                style: {
                    width: `${percent}%`,
                    height: '100%',
                    backgroundColor: barColor,
                    transition: 'width 0.3s ease'
                }
            })),
            detailsText && createElement('div', {
                key: 'progress-details',
                style: { fontSize: '0.75rem', color: '#6b7280' }
            }, detailsText)
        ].filter(Boolean))
    ]);
}
export default function App() {
    const appState = useAppState();
    const { notifyError, notifyInfo, notifySuccess } = useNotifications();
    const { availableTags, currentRun, isPanelOpen, isStarting, lastError, lastRunTags, startAnalysis, setPanelOpen, togglePanel, activeTagFilter, toggleTagFilter, clearTagFilter, addKnownTags } = useBulkAnalysis();
    const periodicMinutes = appState.selectedAccount
        ? appState.periodicMinutesByAccount[appState.selectedAccount] ?? 0
        : 0;
    const assistantActive = appState.currentView === "assistant";
    const deleteMessage = appState.handleDeleteMessage;
    const [isDeletingFiltered, setIsDeletingFiltered] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(null);
    const purgeProgress = appState.purgeProgress || null;
    const normalizedSelectedAccount = appState.selectedAccount
        ? appState.selectedAccount.trim().toLowerCase()
        : null;
    const remoteDeleteProgress = normalizedSelectedAccount
        ? appState.remoteDeleteProgressByAccount[normalizedSelectedAccount] ?? null
        : null;
    const remoteDeleteTotals = remoteDeleteProgress
        ? {
            total: remoteDeleteProgress.pending +
                remoteDeleteProgress.completed +
                remoteDeleteProgress.failed,
            pending: remoteDeleteProgress.pending,
            completed: remoteDeleteProgress.completed,
            failed: remoteDeleteProgress.failed
        }
        : null;
    const remoteDeletePercent = remoteDeleteTotals && remoteDeleteTotals.total > 0
        ? Math.min(100, ((remoteDeleteTotals.completed + remoteDeleteTotals.failed) /
            remoteDeleteTotals.total) *
            100)
        : 0;
    const remoteDeleteSummary = remoteDeleteTotals
        ? `${remoteDeleteTotals.completed} done · ${remoteDeleteTotals.pending} remaining` +
            (remoteDeleteTotals.failed > 0 ? ` · ${remoteDeleteTotals.failed} failed` : "")
        : "";
    const remoteDeleteGlobalProgress = remoteDeleteTotals
        ? {
            pending: remoteDeleteTotals.pending,
            completed: remoteDeleteTotals.completed,
            failed: remoteDeleteTotals.failed,
            total: remoteDeleteTotals.total,
            summary: remoteDeleteSummary
        }
        : null;
    const handleAssistantButtonClick = () => {
        if (assistantActive) {
            if (appState.selectedAccount) {
                appState.handleNavigate("webmail");
            }
            else {
                appState.handleNavigate("settings");
            }
            return;
        }
        appState.handleNavigate("assistant");
    };
    useEffect(() => {
        const collected = new Set();
        appState.currentSenderGroups.forEach((group) => {
            group.messages.forEach((message) => {
                message.analysis_categories.forEach((tag) => {
                    const trimmed = tag.trim();
                    if (trimmed) {
                        collected.add(trimmed);
                    }
                });
            });
        });
        if (collected.size > 0) {
            addKnownTags(Array.from(collected));
        }
    }, [addKnownTags, appState.currentSenderGroups]);
    const mailboxData = useMemo(() => {
        const normalizedFilter = activeTagFilter
            .map((tag) => tag.trim().toLowerCase())
            .filter((tag) => tag.length > 0);
        if (normalizedFilter.length === 0) {
            return {
                senderGroups: appState.currentSenderGroups,
                emails: appState.currentEmails,
                messageRefs: [],
                messageCount: 0
            };
        }
        const filterSet = new Set(normalizedFilter);
        const filteredGroups = [];
        const messageRefs = [];
        const includedUids = new Set();
        appState.currentSenderGroups.forEach((group) => {
            const matchingMessages = group.messages.filter((message) => message.analysis_categories.some((category) => filterSet.has(category.trim().toLowerCase())));
            if (matchingMessages.length === 0) {
                return;
            }
            filteredGroups.push({
                ...group,
                message_count: matchingMessages.length,
                messages: matchingMessages
            });
            matchingMessages.forEach((message) => {
                if (!includedUids.has(message.uid)) {
                    includedUids.add(message.uid);
                    messageRefs.push({ senderEmail: group.sender_email, uid: message.uid });
                }
            });
        });
        const filteredEmails = appState.currentEmails.filter((email) => includedUids.has(email.uid));
        return {
            senderGroups: filteredGroups,
            emails: filteredEmails,
            messageRefs,
            messageCount: messageRefs.length
        };
    }, [activeTagFilter, appState.currentEmails, appState.currentSenderGroups]);
    const handleDeleteFiltered = useCallback(async () => {
        if (mailboxData.messageRefs.length === 0) {
            return;
        }
        const total = mailboxData.messageRefs.length;
        setIsDeletingFiltered(true);
        setDeleteProgress({ completed: 0, total, failed: 0 });
        let completed = 0;
        let failed = 0;
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        try {
            for (const item of mailboxData.messageRefs) {
                let retryCount = 0;
                const maxRetries = 3;
                while (retryCount <= maxRetries) {
                    try {
                        await deleteMessage(item.senderEmail, item.uid, { suppressNotifications: true });
                        completed += 1;
                        setDeleteProgress({ completed, total, failed });
                        break; // Success, exit retry loop
                    }
                    catch (error) {
                        console.error(`Failed to delete message ${item.uid} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
                        if (retryCount < maxRetries) {
                            // Exponential backoff: 1s, 2s, 4s
                            const backoffDelay = Math.pow(2, retryCount) * 1000;
                            await delay(backoffDelay);
                            retryCount += 1;
                        }
                        else {
                            // Max retries reached, mark as failed
                            failed += 1;
                            setDeleteProgress({ completed, total, failed });
                            break;
                        }
                    }
                }
                // Add a small delay between deletions to respect rate limits
                if (completed + failed < total) {
                    await delay(200); // 200ms delay between operations
                }
            }
            // Show final notification
            if (failed === 0) {
                notifySuccess(`Successfully deleted ${completed} messages.`);
            }
            else if (completed === 0) {
                notifyError(`Failed to delete any messages. Check logs for details.`);
            }
            else {
                notifyInfo(`Deleted ${completed} messages, ${failed} failed. Check logs for details.`);
            }
        }
        finally {
            setIsDeletingFiltered(false);
            setDeleteProgress(null);
        }
    }, [deleteMessage, mailboxData.messageRefs, notifySuccess, notifyError, notifyInfo]);
    const handleStartAnalysis = useCallback(async (options) => {
        await startAnalysis(options);
    }, [startAnalysis]);
    return createElement("div", {
        style: {
            display: "flex",
            height: `calc(100vh - ${SYNCFUSION_BANNER_OFFSET}px)`,
            marginTop: `${SYNCFUSION_BANNER_OFFSET}px`
        }
    }, [
        // Navigation Drawer
        createElement(NavigationDrawer, {
            key: "nav-drawer",
            open: appState.drawerOpen,
            accounts: appState.accounts,
            selectedAccount: appState.selectedAccount,
            runtimeByEmail: appState.runtimeByEmail,
            onAccountSelect: appState.handleAccountSelect,
            onNavigate: appState.handleNavigate,
            currentView: appState.currentView,
            onOpenSavedAccounts: appState.handleOpenSavedAccountsDialog,
            hasSavedAccounts: appState.savedAccounts.length > 0
        }),
        // Main Content
        createElement("main", {
            key: "main-content",
            style: {
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
            }
        }, [
            // App Bar
            createElement("header", {
                key: "app-bar",
                style: {
                    backgroundColor: "#ffffff",
                    color: "#000000",
                    borderBottom: "1px solid #e5e7eb",
                    padding: "8px 16px",
                    display: "flex",
                    alignItems: "center",
                    zIndex: 1100
                }
            }, [
                createElement(ButtonComponent, {
                    key: "menu-button",
                    cssClass: "menu-button",
                    content: "☰",
                    onClick: appState.handleDrawerToggle
                }),
                createElement("h1", {
                    key: "title",
                    style: {
                        flexGrow: 1,
                        fontSize: "1.25rem",
                        fontWeight: "500",
                        margin: "0 0 0 16px"
                    }
                }, "Personal Mail Client"),
                createElement(ButtonComponent, {
                    key: "bulk-analysis-toggle",
                    cssClass: isPanelOpen ? "primary" : "outlined",
                    content: "Bulk AI",
                    disabled: appState.accounts.length === 0,
                    onClick: () => {
                        if (appState.accounts.length === 0) {
                            return;
                        }
                        togglePanel();
                    }
                }),
                createElement(ButtonComponent, {
                    key: "assistant-toggle",
                    cssClass: assistantActive ? "primary" : "outlined",
                    content: assistantActive ? "Close Assistant" : "AI Assistant",
                    onClick: handleAssistantButtonClick
                })
            ]),
            remoteDeleteTotals && remoteDeleteTotals.total > 0
                ? createElement("div", {
                    key: "remote-delete-progress",
                    style: {
                        padding: "12px 16px",
                        backgroundColor: "#111827",
                        color: "#f9fafb",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        borderBottom: "1px solid #1f2937"
                    }
                }, [
                    createElement("div", {
                        key: "remote-delete-text",
                        style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            fontSize: "0.9rem"
                        }
                    }, [
                        "Deleting messages from the server…",
                        createElement("span", {
                            key: "remote-delete-counts",
                            style: { fontSize: "0.85rem", opacity: 0.85 }
                        }, remoteDeleteSummary)
                    ]),
                    createElement("div", {
                        key: "remote-delete-bar",
                        style: {
                            height: "6px",
                            backgroundColor: "#1f2937",
                            borderRadius: "999px",
                            overflow: "hidden"
                        }
                    }, createElement("div", {
                        key: "remote-delete-bar-fill",
                        style: {
                            width: `${remoteDeletePercent.toFixed(1)}%`,
                            maxWidth: "100%",
                            height: "100%",
                            backgroundColor: "#34d399",
                            transition: "width 150ms ease-out"
                        }
                    })),
                    ...(remoteDeleteTotals.failed > 0
                        ? [
                            createElement("div", {
                                key: "remote-delete-error",
                                style: { fontSize: "0.8rem", color: "#fca5a5" }
                            }, "Some messages could not be removed remotely. Check the Deleted tab for details.")
                        ]
                        : [])
                ])
                : null,
            // Content Area
            createElement("div", {
                key: "content-area",
                style: {
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "auto",
                    padding: 0
                },
                ref: appState.emailListRef
            }, [
                renderViewContent(appState, periodicMinutes, mailboxData, {
                    activeTagFilter,
                    onClearTagFilter: clearTagFilter,
                    onOpenBulkPanel: () => setPanelOpen(true),
                    filteredMessageCount: mailboxData.messageCount
                })
            ])
        ]),
        // Floating Action Button
        createElement(ButtonComponent, {
            key: "fab",
            cssClass: "fab primary",
            content: "+",
            onClick: appState.handleOpenConnectionWizard
        }),
        // Connection Wizard
        createElement(ConnectionWizard, {
            key: "connection-wizard",
            open: appState.connectionWizardOpen,
            onClose: appState.handleCloseConnectionWizard,
            onConnected: appState.handleAccountConnected
        }),
        // Saved Accounts Dialog
        createElement(SavedAccountsDialog, {
            key: "saved-accounts-dialog",
            open: appState.savedAccountsDialogOpen,
            onClose: appState.handleCloseSavedAccountsDialog,
            savedAccounts: appState.savedAccounts,
            onConnectSaved: appState.handleConnectSavedAccount,
            connectingSavedEmail: appState.connectingSavedEmail,
            onOpenConnectionWizard: appState.handleOpenConnectionWizard
        }),
        createElement(GlobalProgressBar, {
            key: "global-progress",
            deleteProgress,
            purgeProgress,
            remoteDeleteProgress: remoteDeleteGlobalProgress
        }),
        createElement(NotificationsHost, { key: "notifications-host" }),
        createElement(BulkAnalysisPanel, {
            key: "bulk-analysis-panel",
            isOpen: isPanelOpen,
            onClose: () => setPanelOpen(false),
            availableTags,
            currentRun,
            isStarting,
            lastError,
            lastRunTags,
            onStart: handleStartAnalysis,
            activeTagFilter,
            onToggleTagFilter: toggleTagFilter,
            onClearFilter: clearTagFilter,
            filteredMessageCount: mailboxData.messageCount,
            onDeleteFiltered: handleDeleteFiltered,
            isDeletingFiltered,
            deleteProgress
        })
    ]);
}
function renderViewContent(appState, periodicMinutes, mailboxData, bulkUi) {
    const { currentView, selectedAccount } = appState;
    if ((currentView === "webmail" || currentView === "pivot") && selectedAccount) {
        return createElement(Mailbox, {
            key: `${currentView}-view`,
            viewType: currentView,
            selectedAccount: selectedAccount,
            accounts: appState.accounts,
            emails: mailboxData.emails,
            senderGroups: mailboxData.senderGroups,
            totalCachedCount: appState.totalCachedCount,
            syncReport: appState.syncReport,
            syncProgress: appState.syncProgress,
            onRefreshEmails: appState.handleRefreshEmails,
            onFullSync: appState.handleFullSync,
            isSyncing: appState.isSyncing,
            isRefreshing: appState.refreshingAccount === selectedAccount,
            expandedSenderForAccount: appState.expandedSenders[selectedAccount] || null,
            onToggleExpansion: appState.toggleSenderExpansion,
            onStatusChange: appState.handleSenderStatusChange,
            statusUpdating: appState.statusUpdating,
            onDeleteMessage: appState.handleDeleteMessage,
            pendingDeleteUid: appState.pendingDeleteUid,
            hasMoreEmails: appState.hasMoreEmails,
            onLoadMoreEmails: appState.handleLoadMoreEmails,
            isLoadingMoreEmails: appState.isLoadingMoreEmails,
            activeTagFilter: bulkUi.activeTagFilter,
            onClearTagFilter: bulkUi.onClearTagFilter,
            onOpenBulkPanel: bulkUi.onOpenBulkPanel,
            filteredMessageCount: bulkUi.filteredMessageCount
        });
    }
    if (currentView === "automation" && selectedAccount) {
        return createElement(AutomationView, {
            key: "automation-view",
            account: appState.selectedAccountEntity,
            email: selectedAccount,
            periodicMinutes: periodicMinutes,
            onPeriodicMinutesChange: appState.handlePeriodicMinutesChange,
            onSavePeriodicSync: appState.handleSavePeriodicSync,
            isSavingPeriodic: appState.isSavingPeriodic,
            blockFolder: appState.blockFolder,
            onBlockFolderChange: appState.setBlockFolder,
            onApplyBlockFilter: appState.handleApplyBlockFilter,
            isApplyingBlockFilter: appState.isApplyingBlockFilter,
            syncReport: appState.syncReport,
            syncProgress: appState.syncProgress,
            onFullSync: appState.handleFullSync,
            isSyncing: appState.isSyncing,
            isRefreshing: appState.refreshingAccount === selectedAccount,
            emailsCount: appState.currentEmails.length,
            totalKnownMessages: appState.totalCachedCount
        });
    }
    if (currentView === "assistant") {
        return createElement(LlmAssistantView, { key: "assistant-view" });
    }
    if (currentView === "accounts") {
        return createElement(AccountsView, {
            key: "accounts-view",
            accounts: appState.accounts,
            savedAccounts: appState.savedAccounts,
            runtimeByEmail: appState.runtimeByEmail,
            selectedAccount: selectedAccount,
            activeAccount: appState.selectedAccountEntity,
            statusPills: appState.selectedAccountStatusPills,
            syncReport: appState.syncReport,
            syncProgress: appState.syncProgress,
            isSyncing: appState.isSyncing,
            isRefreshing: appState.refreshingAccount === selectedAccount,
            emailsCount: appState.currentEmails.length,
            totalKnownMessages: appState.totalCachedCount,
            onAddAccount: appState.handleOpenConnectionWizard,
            onSelectAccount: (email) => {
                appState.handleAccountSelect(email);
            },
            onConnectSaved: appState.handleConnectSavedAccount,
            onRemoveAccount: appState.handleRemoveAccount,
            connectingSavedEmail: appState.connectingSavedEmail
        });
    }
    if (currentView === "settings") {
        return createElement(SettingsView, { key: "settings-view" });
    }
    if (currentView === "sync" && selectedAccount) {
        return createElement("div", {
            key: "sync-view",
            style: { padding: "24px" }
        }, [
            createElement("h2", { key: "sync-title", style: { marginBottom: "16px" } }, `Sync Settings for ${selectedAccount}`),
            createElement("p", { key: "sync-desc", style: { color: "#6b7280" } }, "Sync configuration will be implemented here.")
        ]);
    }
    if (currentView === "blocked" && selectedAccount) {
        return createElement(BlockedSendersView, {
            key: "blocked-view",
            senderGroups: appState.currentSenderGroups,
            accountEmail: selectedAccount,
            onStatusChange: appState.handleSenderStatusChange,
            statusUpdating: appState.statusUpdating,
            onRefresh: appState.handleRefreshEmails,
            onDeleteMessage: appState.handleDeleteMessage,
            onPurgeSender: appState.handlePurgeSenderMessages,
            hasSenderData: appState.currentSenderGroups.length > 0
        });
    }
    if (currentView === "blocked-domains" && selectedAccount) {
        return createElement(BlockedDomainsView, {
            key: "blocked-domains-view",
            senderGroups: appState.currentSenderGroups,
            accountEmail: selectedAccount,
            onStatusChange: appState.handleSenderStatusChange,
            statusUpdating: appState.statusUpdating,
            onRefresh: appState.handleRefreshEmails,
            onDeleteMessage: appState.handleDeleteMessage,
            onPurgeSender: appState.handlePurgeSenderMessages,
            hasSenderData: appState.currentSenderGroups.length > 0
        });
    }
    if (currentView === "deleted" && selectedAccount) {
        return createElement(DeletedEmailsView, {
            key: "deleted-view",
            accountEmail: selectedAccount,
            emails: appState.currentDeletedEmails,
            onRestore: appState.handleRestoreDeletedEmail,
            onPurge: appState.handlePurgeDeletedEmail,
            onRefresh: () => appState.loadDeletedEmails(selectedAccount).then(() => undefined)
        });
    }
    // Welcome view
    return createElement("div", {
        key: "welcome-view",
        style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            textAlign: "center"
        }
    }, [
        createElement("h2", { key: "welcome-title", style: { marginBottom: "16px" } }, "Welcome to Personal Mail Client"),
        createElement("p", { key: "welcome-desc", style: { marginBottom: "32px", color: "#6b7280" } }, "Connect an email account to get started with professional email management."),
        createElement("div", {
            key: "welcome-actions",
            style: {
                display: "flex",
                gap: "12px"
            }
        }, [
            createElement(ButtonComponent, {
                key: "connect-button",
                cssClass: "primary large",
                content: "+ Connect Account",
                onClick: appState.handleOpenConnectionWizard
            }),
            createElement(ButtonComponent, {
                key: "saved-accounts-button",
                cssClass: "e-outline large",
                content: "Saved Accounts",
                onClick: appState.handleOpenSavedAccountsDialog
            })
        ])
    ]);
}
