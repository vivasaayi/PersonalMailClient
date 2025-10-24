import { useMemo } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type { Account, EmailSummary, SenderGroup, SyncProgress, SyncReport } from "../types";
import EmailList, { type EmailInsightRecord } from "./EmailList";
import SenderGrid from "./SenderGrid";
import { WebMailView } from "./WebMailView";
import { AccountStatusBanner } from "./AccountStatusBanner";
import { buildSyncStatusPills } from "../utils/mailboxStatus";

type ViewType = "webmail" | "pivot";

const viewMeta: Record<ViewType, { title: string; description: string }> = {
  webmail: {
    title: "Webmail",
    description: "Day-to-day email reading and management"
  },
  pivot: {
    title: "Pivot View",
    description: "Sender analysis and bulk classification"
  }
};

interface MailboxProps {
  viewType: ViewType;
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
  isRefreshing: boolean;
  expandedSenderForAccount: string | null;
  onToggleExpansion: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: string) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  pendingDeleteUid: string | null;
}

export default function Mailbox({
  viewType,
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
  isRefreshing,
  expandedSenderForAccount,
  onToggleExpansion,
  onStatusChange,
  statusUpdating,
  onDeleteMessage,
  pendingDeleteUid
}: MailboxProps) {

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
  const currentViewMeta = viewMeta[viewType];
  const totalKnownMessages = Math.max(totalCachedCount, emails.length);

  const statusPills = buildSyncStatusPills({
    isSyncing,
    isRefreshing,
    syncReport,
    syncProgress,
    emailsCount: emails.length,
    totalKnownMessages
  });

  const handleRefreshClick = () => {
    void onRefreshEmails();
  };

  const handleFullSyncClick = () => {
    void onFullSync();
  };
  const quickActions = (
    <>
      <ButtonComponent
        cssClass="ghost-button mailbox-action"
        content={isRefreshing ? "Refreshing…" : "Refresh recent"}
        disabled={isRefreshing}
        onClick={handleRefreshClick}
      />
      <ButtonComponent
        cssClass="primary mailbox-action"
        content={isSyncing ? "Syncing…" : "Full sync"}
        disabled={isSyncing}
        onClick={handleFullSyncClick}
      />
    </>
  );

  return (
    <div className="mailbox-shell">
      <AccountStatusBanner
        account={account}
        email={selectedAccount}
        statusPills={statusPills}
        actions={quickActions}
      />

      <main className="mailbox-body">
        {viewType === "webmail" ? (
          <WebMailView emails={emails} messageInsights={messageInsights} />
        ) : (
          <SenderGrid
            senderGroups={senderGroups}
            expandedSenderForAccount={expandedSenderForAccount}
            onToggleExpansion={onToggleExpansion}
            onStatusChange={onStatusChange}
            statusUpdating={statusUpdating}
            onDeleteMessage={onDeleteMessage}
            pendingDeleteUid={pendingDeleteUid}
          />
        )}
      </main>
    </div>
  );
}