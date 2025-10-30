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
import { useBulkAnalysis } from "./stores/bulkAnalysisStore";
const SYNCFUSION_BANNER_OFFSET = 72;
export default function App() {
    const appState = useAppState();
    const { availableTags, currentRun, isPanelOpen, isStarting, lastError, lastRunTags, startAnalysis, setPanelOpen, togglePanel, activeTagFilter, toggleTagFilter, clearTagFilter, addKnownTags } = useBulkAnalysis();
    const periodicMinutes = appState.selectedAccount
        ? appState.periodicMinutesByAccount[appState.selectedAccount] ?? 0
        : 0;
    const assistantActive = appState.currentView === "assistant";
    const deleteMessage = appState.handleDeleteMessage;
    const [isDeletingFiltered, setIsDeletingFiltered] = useState(false);
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
        setIsDeletingFiltered(true);
        try {
            for (const item of mailboxData.messageRefs) {
                await deleteMessage(item.senderEmail, item.uid);
            }
        }
        finally {
            setIsDeletingFiltered(false);
        }
    }, [deleteMessage, mailboxData.messageRefs]);
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
            isDeletingFiltered
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
            hasSenderData: appState.currentSenderGroups.length > 0
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
