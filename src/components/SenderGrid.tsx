import { useMemo, useState } from "react";
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridRowSelectionModel,
} from "@mui/x-data-grid";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Paper,
  Typography,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  Group as GroupIcon,
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
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

  const expandedGroup = useMemo(() => {
    if (!expandedSenderForAccount) {
      return null;
    }
    return senderGroups.find((group) => group.sender_email === expandedSenderForAccount) ?? null;
  }, [expandedSenderForAccount, senderGroups]);

  const selectionModel: GridRowSelectionModel = useMemo(
    () => ({
      type: "include" as const,
      ids: new Set(expandedSenderForAccount ? [expandedSenderForAccount] : []),
    }),
    [expandedSenderForAccount]
  );

  const columns: GridColDef<SenderGroup>[] = [
    {
      field: 'sender_display',
      headerName: 'Sender',
      flex: 1.2,
      minWidth: 220,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
          <ExpandMoreIcon
            fontSize="small"
            sx={{
              transform: expandedSenderForAccount === params.row.sender_email ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.2s',
            }}
          />
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {params.row.sender_display || params.row.sender_email}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {params.row.sender_email}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      field: 'message_count',
      headerName: 'Messages',
      flex: 0.5,
      minWidth: 120,
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
      flex: 0.9,
      minWidth: 220,
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
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {senderGroups.length === 0 ? (
        <Card sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CardContent>
            <Stack spacing={1} alignItems="center" textAlign="center">
              <GroupIcon fontSize="large" color="disabled" />
              <Typography variant="h6" color="text.secondary">
                No cached messages yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Run a full sync to populate sender insights.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', gap: 3, flex: 1, overflow: 'hidden' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <DataGrid
              rows={senderGroups}
              columns={columns}
              getRowId={(row) => row.sender_email}
              pageSizeOptions={[10, 25, 50]}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              rowSelectionModel={selectionModel}
              onRowSelectionModelChange={(newSelection) => {
                const nextId = Array.from(newSelection.ids)[0] as string | undefined;
                if (!nextId && expandedSenderForAccount) {
                  onToggleExpansion(expandedSenderForAccount);
                } else if (nextId) {
                  onToggleExpansion(nextId);
                }
              }}
              onRowClick={(params) => onToggleExpansion(params.row.sender_email)}
              disableColumnMenu
              density="comfortable"
              sx={{
                border: 0,
                height: '100%',
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid',
                  borderBottomColor: 'divider',
                },
                '& .MuiDataGrid-columnHeaders': {
                  borderBottom: '1px solid',
                  borderBottomColor: 'divider',
                  backgroundColor: 'background.paper',
                },
                '& .MuiDataGrid-row.Mui-selected': {
                  backgroundColor: 'action.selected',
                  '&:hover': {
                    backgroundColor: 'action.selected',
                  },
                },
              }}
            />
          </Box>

          <Card
            variant="outlined"
            sx={{
              width: { xs: '100%', md: 360 },
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <CardContent sx={{ flex: 1, overflowY: 'auto' }}>
              {expandedGroup ? (
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      {expandedGroup.sender_display || expandedGroup.sender_email}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {expandedGroup.sender_email}
                    </Typography>
                  </Box>

                  <Divider />

                  <Stack spacing={2}>
                    {getDetailPanelContent({ row: expandedGroup })}
                  </Stack>
                </Stack>
              ) : (
                <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: '100%' }}>
                  <GroupIcon color="disabled" fontSize="large" />
                  <Typography variant="body1" color="text.secondary">
                    Select a sender to inspect recent messages.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}