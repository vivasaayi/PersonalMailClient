import { useCallback } from "react";
import type { EmailSummary, SenderStatus, SyncProgress } from "../types";
import type { EmailInsightRecord } from "./EmailList";
import { SyncControls } from "./SyncControls";
import { EmailListContainer } from "./EmailListContainer";
import { StatusBanner } from "./StatusBanner";

interface WebMailViewProps {
  emails: EmailSummary[];
  messageInsights: Record<string, EmailInsightRecord | undefined>;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  hasMoreEmails: boolean;
  onLoadMoreEmails?: () => Promise<void> | void;
  isLoadingMoreEmails: boolean;
  // Sync-related props
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncTime: number | null;
  onFullSync: () => Promise<void>;
  onCancelSync: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function WebMailView({
  emails,
  messageInsights,
  onStatusChange,
  statusUpdating,
  hasMoreEmails,
  onLoadMoreEmails,
  isLoadingMoreEmails,
  isSyncing,
  syncProgress,
  lastSyncTime,
  onFullSync,
  onCancelSync,
  onRefresh
}: WebMailViewProps) {
  const handleEmailAction = useCallback(async (emailId: string, action: string) => {
    // TODO: Implement email actions
    console.log(`Action ${action} on email ${emailId}`);
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      backgroundColor: "#ffffff"
    }}>
      <StatusBanner
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        lastSyncTime={lastSyncTime}
        totalEmails={emails.length}
      />

      <SyncControls
        isSyncing={isSyncing}
        syncProgress={syncProgress}
        onFullSync={onFullSync}
        onCancelSync={onCancelSync}
        onRefresh={onRefresh}
      />

      <EmailListContainer
        emails={emails}
        messageInsights={messageInsights}
        onEmailAction={handleEmailAction}
      />
    </div>
  );
}
