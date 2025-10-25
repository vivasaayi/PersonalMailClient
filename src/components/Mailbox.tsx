import { useMemo } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type {
  Account,
  EmailSummary,
  SenderGroup,
  SenderStatus,
  SyncProgress,
  SyncReport
} from "../types";
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
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  pendingDeleteUid: string | null;
  hasMoreEmails: boolean;
  onLoadMoreEmails: () => Promise<void> | void;
  isLoadingMoreEmails: boolean;
  activeTagFilter: string[];
  onClearTagFilter: () => void;
  onOpenBulkPanel: () => void;
  filteredMessageCount: number;
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
  pendingDeleteUid,
  hasMoreEmails,
  onLoadMoreEmails,
  isLoadingMoreEmails,
  activeTagFilter,
  onClearTagFilter,
  onOpenBulkPanel,
  filteredMessageCount
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

  const hasActiveFilter = activeTagFilter.length > 0;
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

      {hasActiveFilter && (
        <div
          style={{
            margin: "12px 24px",
            padding: "12px 16px",
            border: "1px solid #c7d2fe",
            borderRadius: "8px",
            backgroundColor: "#eef2ff",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#312e81" }}>
              AI tag filter active
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <ButtonComponent
                cssClass="ghost-button"
                content="Edit tags"
                onClick={onOpenBulkPanel}
              />
              <ButtonComponent
                cssClass="ghost-button"
                content="Clear"
                onClick={onClearTagFilter}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {activeTagFilter.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  backgroundColor: "#c7d2fe",
                  color: "#1e1b4b",
                  fontSize: "0.75rem",
                  fontWeight: 600
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#3730a3" }}>
            {filteredMessageCount === 0
              ? "No messages match the selected tags in the current cache."
              : `Showing ${filteredMessageCount} message${filteredMessageCount === 1 ? "" : "s"} with these tags.`}
          </div>
        </div>
      )}

      <main className="mailbox-body">
        {hasActiveFilter && filteredMessageCount === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
              fontSize: "0.95rem",
              padding: "24px"
            }}
          >
            Adjust the tag filter to see matching messages.
          </div>
        ) : viewType === "webmail" ? (
          <WebMailView
            emails={emails}
            messageInsights={messageInsights}
            onStatusChange={onStatusChange}
            statusUpdating={statusUpdating}
            hasMoreEmails={hasMoreEmails}
            onLoadMoreEmails={onLoadMoreEmails}
            isLoadingMoreEmails={isLoadingMoreEmails}
          />
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