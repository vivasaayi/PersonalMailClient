import { createElement, useMemo, useState } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TabComponent, TabItemDirective, TabItemsDirective } from "@syncfusion/ej2-react-navigations";
import { ProgressBarComponent } from "@syncfusion/ej2-react-progressbar";
import type { Account, EmailSummary, SenderGroup, SyncReport, SyncProgress } from "../types";
import EmailList, { type EmailInsightRecord } from "./EmailList";
import SenderGrid from "./SenderGrid";

type TabKey = "recent" | "senders";

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
  }
];

interface MailboxProps {
  selectedAccount: string;
  accounts: Account[];
  emails: EmailSummary[];
  senderGroups: SenderGroup[];
  totalCachedCount: number;
  syncReport: SyncReport | null;
  syncProgress: SyncProgress | null;
  onRefreshEmails: () => Promise<void>;
  onFullSync: () => Promise<void>;
  isSyncing: boolean;
  expandedSenderForAccount: string | null;
  onToggleExpansion: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: string) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  pendingDeleteUid: string | null;
}

export default function Mailbox({
  selectedAccount,
  accounts,
  emails,
  senderGroups,
  totalCachedCount,
  syncReport,
  syncProgress,
  onRefreshEmails,
  onFullSync,
  isSyncing,
  expandedSenderForAccount,
  onToggleExpansion,
  onStatusChange,
  statusUpdating,
  onDeleteMessage,
  pendingDeleteUid
}: MailboxProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("senders");

  const messageInsights = useMemo<Record<string, EmailInsightRecord>>(() => {
    const map: Record<string, EmailInsightRecord> = {};
    senderGroups.forEach((group) => {
      group.messages.forEach((message) => {
        map[message.uid] = {
          senderEmail: group.sender_email,
          senderDisplay: group.sender_display,
          message,
        };
      });
    });
    return map;
  }, [senderGroups]);

  const account = accounts.find((acct) => acct.email === selectedAccount);
  const providerLabel = account ? account.provider : "yahoo";

  const getTabIcon = (tabKey: TabKey) => {
    switch (tabKey) {
      case "recent":
        return "📧";
      case "senders":
        return "👥";
      default:
        return "📧";
    }
  };

  return createElement('div', { style: { height: '100%', display: 'flex', flexDirection: 'column' } }, [
    // Header
    createElement('div', {
      key: 'header',
      style: { padding: '16px', marginBottom: '16px', backgroundColor: '#1f2937', borderRadius: '8px' }
    }, [
      createElement('div', { key: 'header-content', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        createElement('div', { key: 'account-info' }, [
          createElement('div', {
            key: 'account-name',
            style: { fontSize: '24px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }
          }, selectedAccount),
          createElement('span', {
            key: 'provider-chip',
            style: { padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '12px', backgroundColor: '#1e40af', color: '#ffffff' }
          }, `Connected via ${providerLabel}`)
        ]),
        createElement('div', { key: 'actions', style: { display: 'flex', gap: '8px' } }, [
          createElement(ButtonComponent, {
            key: 'refresh',
            cssClass: 'refresh-button',
            content: 'Refresh recent',
            onClick: onRefreshEmails
          }),
          createElement(ButtonComponent, {
            key: 'sync',
            cssClass: 'sync-button primary',
            content: isSyncing ? "Syncing…" : "Full sync",
            disabled: isSyncing,
            onClick: onFullSync
          })
        ])
      ])
    ]),

    // Stats
    createElement('div', { key: 'stats', style: { padding: '16px', marginBottom: '16px', backgroundColor: '#ffffff', borderRadius: '8px' } }, [
      createElement('div', { key: 'stats-content', style: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' } }, [
        createElement('span', {
          key: 'message-count',
          style: { padding: '4px 8px', border: '1px solid #0ea5e9', borderRadius: '4px', fontSize: '14px', backgroundColor: '#f0f9ff', color: '#0c4a6e' }
        }, `${emails.length.toLocaleString()}${totalCachedCount > emails.length ? ` of ${totalCachedCount.toLocaleString()}` : ""} cached message${totalCachedCount === 1 ? "" : "s"}`),
        syncReport && createElement('span', {
          key: 'sync-report',
          style: { padding: '4px 8px', border: '1px solid #16a34a', borderRadius: '4px', fontSize: '14px', backgroundColor: '#f0fdf4', color: '#14532d' }
        }, `Last sync: ${syncReport.stored.toLocaleString()} stored • ${syncReport.fetched.toLocaleString()} fetched`),
        syncProgress && syncProgress.total_batches > 0 && createElement('span', {
          key: 'progress-info',
          style: { padding: '4px 8px', border: '1px solid #f59e0b', borderRadius: '4px', fontSize: '14px', backgroundColor: '#fffbeb', color: '#92400e' }
        }, `Batch ${syncProgress.batch}/${syncProgress.total_batches} (${syncProgress.fetched.toLocaleString()} fetched)`)
      ]),
      // Progress Bar
      syncProgress && syncProgress.total_batches > 0 && createElement('div', {
        key: 'progress-container',
        style: { marginTop: '16px' }
      }, [
        createElement(ProgressBarComponent, {
          key: 'progress-bar',
          value: Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100)),
          type: 'Linear',
          height: '8px',
          cornerRadius: 'Circular'
        })
      ])
    ]),

    // Tabs
    createElement('div', { key: 'tabs', style: { marginBottom: '16px', backgroundColor: '#ffffff', borderRadius: '8px' } }, [
      createElement(TabComponent, {
        key: 'tab-component',
        selectedItem: activeTab === 'recent' ? 0 : 1,
        selecting: (args: any) => setActiveTab(args.selectingItem === 0 ? 'recent' : 'senders')
      }, [
        createElement(TabItemsDirective, { key: 'tab-items' }, [
          createElement(TabItemDirective, {
            key: 'recent-tab',
            header: { text: `${getTabIcon('recent')} Recent`, iconCss: '' },
            content: () => createElement(EmailList, { emails, messageInsights })
          }),
          createElement(TabItemDirective, {
            key: 'senders-tab',
            header: { text: `${getTabIcon('senders')} Senders`, iconCss: '' },
            content: () => createElement(SenderGrid, {
              senderGroups,
              expandedSenderForAccount,
              onToggleExpansion,
              onStatusChange,
              statusUpdating,
              onDeleteMessage,
              pendingDeleteUid
            })
          })
        ])
      ])
    ])
  ]);
}