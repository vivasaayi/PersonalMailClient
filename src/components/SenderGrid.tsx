import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { SenderGroup, SenderStatus, AnalyzedMessage } from "../types";

interface SenderGridProps {
  senderGroups: SenderGroup[];
  expandedSenderForAccount: string | null;
  onToggleExpansion: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  pendingDeleteUid: string | null;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return dayjs(value).format("MMM D, YYYY h:mm A");
};

const statusLabel = (status: SenderStatus) => {
  switch (status) {
    case "allowed":
      return "Allowed";
    case "blocked":
      return "Blocked";
    default:
      return "Neutral";
  }
};

export default function SenderGrid({
  senderGroups,
  expandedSenderForAccount,
  onToggleExpansion,
  onStatusChange,
  statusUpdating,
  onDeleteMessage,
  pendingDeleteUid
}: SenderGridProps) {
  const columns: GridColDef[] = [
    {
      field: 'sender_display',
      headerName: 'Sender',
      width: 300,
      renderCell: (params: GridRenderCellParams) => (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            cursor: 'pointer',
            width: '100%'
          }}
          onClick={() => onToggleExpansion(params.row.sender_email)}
        >
          <ExpandMoreIcon
            sx={{
              transform: expandedSenderForAccount === params.row.sender_email ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s'
            }}
          />
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {params.row.sender_display}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {params.row.sender_email}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: 'message_count',
      headerName: 'Messages',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={`${params.value} message${params.value === 1 ? '' : 's'}`}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 200,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const statuses: SenderStatus[] = ["allowed", "neutral", "blocked"];
        const isUpdating = statusUpdating === params.row.sender_email;

        return (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            {statuses.map((status) => (
              <Button
                key={status}
                size="small"
                variant={params.row.status === status ? "contained" : "outlined"}
                color={
                  status === "allowed" ? "success" :
                  status === "blocked" ? "error" : "inherit"
                }
                onClick={() => onStatusChange(params.row.sender_email, status)}
                disabled={isUpdating || params.row.status === status}
                sx={{ minWidth: 'auto', px: 1, py: 0.5 }}
              >
                {statusLabel(status)}
              </Button>
            ))}
          </Box>
        );
      },
    },
  ];

  const getDetailPanelContent = (params: { row: SenderGroup }) => {
    const row = params.row;
    if (!row.messages || row.messages.length === 0) {
      return (
        <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
          No messages to display
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2, maxHeight: '400px', overflowY: 'auto' }}>
        {row.messages.map((message: AnalyzedMessage) => {
          const deleteKey = `${row.sender_email}::${message.uid}`;
          return (
            <Paper key={message.uid} sx={{ p: 2, mb: 1, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    {message.subject || "(No subject)"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(message.date)}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  color="error"
                  variant="outlined"
                  startIcon={<DeleteIcon />}
                  onClick={() => onDeleteMessage(row.sender_email, message.uid)}
                  disabled={pendingDeleteUid === deleteKey}
                >
                  {pendingDeleteUid === deleteKey ? "Deleting..." : "Delete"}
                </Button>
              </Box>

              {message.analysis_sentiment && (
                <Chip
                  label={`Sentiment: ${message.analysis_sentiment}`}
                  size="small"
                  color={
                    message.analysis_sentiment === 'positive' ? 'success' :
                    message.analysis_sentiment === 'negative' ? 'error' : 'default'
                  }
                  sx={{ mb: 1 }}
                />
              )}

              <Typography variant="body2" sx={{ mb: 1 }}>
                {message.analysis_summary ?? message.snippet ?? "No preview available."}
              </Typography>

              {message.analysis_categories.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                  {message.analysis_categories.map((category: string) => (
                    <Chip
                      key={category}
                      label={category}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              )}

              {message.flags && (
                <Typography variant="caption" color="text.secondary">
                  Flags: {message.flags}
                </Typography>
              )}
            </Paper>
          );
        })}
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      {senderGroups.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No cached messages yet. Try a full sync.
          </Typography>
        </Paper>
      ) : (
        <DataGrid
          rows={senderGroups}
          columns={columns}
          getRowId={(row) => row.sender_email}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10 },
            },
          }}
          getDetailPanelContent={getDetailPanelContent}
          sx={{
            border: 0,
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid',
              borderBottomColor: 'divider',
            },
            '& .MuiDataGrid-columnHeaders': {
              borderBottom: '2px solid',
              borderBottomColor: 'primary.main',
            },
          }}
        />
      )}
    </Box>
  );
}