import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import {
  Sync as SyncIcon,
  Block as BlockIcon,
  Schedule as ScheduleIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import type { SyncReport } from '../types';

interface AutomationViewProps {
  periodicMinutes: number;
  onPeriodicMinutesChange: (value: number) => void;
  onSavePeriodicSync: () => Promise<void>;
  isSavingPeriodic: boolean;
  blockFolder: string;
  onBlockFolderChange: (value: string) => void;
  onApplyBlockFilter: () => Promise<void>;
  isApplyingBlockFilter: boolean;
  syncReport: SyncReport | null;
  onFullSync: () => Promise<void>;
  isSyncing: boolean;
}

export default function AutomationView({
  periodicMinutes,
  onPeriodicMinutesChange,
  onSavePeriodicSync,
  isSavingPeriodic,
  blockFolder,
  onBlockFolderChange,
  onApplyBlockFilter,
  isApplyingBlockFilter,
  syncReport,
  onFullSync,
  isSyncing
}: AutomationViewProps) {
  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Automation Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Configure automatic email processing and synchronization for this account.
      </Typography>

      {/* Periodic Sync Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <ScheduleIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" component="h2">
              Periodic Sync
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Keep this mailbox fresh by syncing on a schedule.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Interval</InputLabel>
              <Select
                value={periodicMinutes}
                label="Interval"
                onChange={(event) => onPeriodicMinutesChange(Number(event.target.value) || 0)}
              >
                <MenuItem value={0}>Disabled</MenuItem>
                <MenuItem value={5}>5 minutes</MenuItem>
                <MenuItem value={15}>15 minutes</MenuItem>
                <MenuItem value={30}>30 minutes</MenuItem>
                <MenuItem value={60}>1 hour</MenuItem>
                <MenuItem value={120}>2 hours</MenuItem>
                <MenuItem value={240}>4 hours</MenuItem>
                <MenuItem value={480}>8 hours</MenuItem>
                <MenuItem value={1440}>24 hours</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={onSavePeriodicSync}
              disabled={isSavingPeriodic}
              startIcon={<SyncIcon />}
            >
              {isSavingPeriodic ? "Saving…" : periodicMinutes > 0 ? "Enable" : "Disable"}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Set to &quot;Disabled&quot; to turn off periodic syncing.
          </Typography>
        </CardContent>
      </Card>

      {/* Block Filter Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <BlockIcon sx={{ mr: 1, color: 'error.main' }} />
            <Typography variant="h6" component="h2">
              Blocked Sender Filter
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Move messages from blocked senders to a safer folder.
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <TextField
              label="Target Folder"
              value={blockFolder}
              onChange={(event) => onBlockFolderChange(event.target.value)}
              placeholder="Blocked"
              sx={{ minWidth: 200 }}
            />

            <Button
              variant="contained"
              color="error"
              onClick={onApplyBlockFilter}
              disabled={isApplyingBlockFilter}
              startIcon={<BlockIcon />}
            >
              {isApplyingBlockFilter ? "Applying…" : "Apply Filter"}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Leave blank to use the provider default &quot;Blocked&quot; folder.
          </Typography>
        </CardContent>
      </Card>

      {/* Last Sync Report Card */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <PlayArrowIcon sx={{ mr: 1, color: 'success.main' }} />
            <Typography variant="h6" component="h2">
              Last Full Sync
            </Typography>
          </Box>

          {syncReport ? (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Chip
                  label={`Fetched: ${syncReport.fetched.toLocaleString()}`}
                  color="info"
                  variant="outlined"
                />
                <Chip
                  label={`Stored: ${syncReport.stored.toLocaleString()}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`Duration: ${(syncReport.duration_ms / 1000).toFixed(1)}s`}
                  color="warning"
                  variant="outlined"
                />
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              No full sync run in this session yet.
            </Typography>
          )}

          <Button
            variant="outlined"
            onClick={onFullSync}
            disabled={isSyncing}
            startIcon={<SyncIcon />}
          >
            {isSyncing ? "Syncing…" : "Run Full Sync"}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}