import { useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Tabs,
  Tab,
  Alert,
  LinearProgress,
  Chip
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  Email as EmailIcon,
  Group as GroupIcon
} from "@mui/icons-material";
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
        return <EmailIcon />;
      case "senders":
        return <GroupIcon />;
      default:
        return <EmailIcon />;
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2, backgroundColor: 'custom.mailbox.headerBg' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" component="h2" gutterBottom>
              {selectedAccount}
            </Typography>
            <Chip
              label={`Connected via ${providerLabel}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={onRefreshEmails}
              size="small"
            >
              Refresh recent
            </Button>
            <Button
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={onFullSync}
              disabled={isSyncing}
              size="small"
            >
              {isSyncing ? "Syncing…" : "Full sync"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Stats */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" flexWrap="wrap" gap={2} alignItems="center">
          <Chip
            label={`${emails.length.toLocaleString()}${
              totalCachedCount > emails.length
                ? ` of ${totalCachedCount.toLocaleString()}`
                : ""
            } cached message${totalCachedCount === 1 ? "" : "s"}`}
            color="info"
            variant="outlined"
          />
          {syncReport && (
            <Chip
              label={`Last sync: ${syncReport.stored.toLocaleString()} stored • ${syncReport.fetched.toLocaleString()} fetched`}
              color="success"
              variant="outlined"
            />
          )}
          {syncProgress && syncProgress.total_batches > 0 && (
            <Chip
              label={`Batch ${syncProgress.batch}/${syncProgress.total_batches} (${syncProgress.fetched.toLocaleString()} fetched)`}
              color="warning"
              variant="outlined"
            />
          )}
        </Box>

        {/* Progress Bar */}
        {syncProgress && syncProgress.total_batches > 0 && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.round((syncProgress.batch / syncProgress.total_batches) * 100))}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}
      </Paper>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          aria-label="Mailbox views"
          sx={{
            '& .MuiTab-root': {
              minHeight: 64,
              textTransform: 'none',
            }
          }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.key}
              value={tab.key}
              icon={getTabIcon(tab.key)}
              iconPosition="start"
              label={
                <Box>
                  <Typography variant="body1">{tab.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tab.description}
                  </Typography>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === "recent" && (
          <EmailList emails={emails} messageInsights={messageInsights} />
        )}
        {activeTab === "senders" && (
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
      </Box>
    </Box>
  );
}