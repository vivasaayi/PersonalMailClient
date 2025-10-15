import { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Box,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  IconButton
} from "@mui/material";
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Login as LoginIcon,
  CheckCircle as CheckCircleIcon
} from "@mui/icons-material";
import type { Provider, SavedAccount } from "../types";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

interface AccountFormState {
  provider: Provider;
  email: string;
  password: string;
  customHost?: string;
  customPort?: string;
}

const initialFormState: AccountFormState = {
  provider: "yahoo",
  email: "",
  password: "",
  customHost: "",
  customPort: "993"
};

interface AccountFormProps {
  formState: AccountFormState;
  onFormStateChange: (key: keyof AccountFormState, value: string) => void;
  onConnect: (payload: any) => Promise<void>;
  onPrefill: (saved: SavedAccount) => Promise<void>;
  onConnectSaved: (saved: SavedAccount) => Promise<void>;
  savedAccounts: SavedAccount[];
  isLoadingSavedAccounts: boolean;
  onLoadSavedAccounts: () => Promise<void>;
  isSubmitting: boolean;
  prefillingSavedEmail: string | null;
  connectingSavedEmail: string | null;
}

export default function AccountForm({
  formState,
  onFormStateChange,
  onConnect,
  onPrefill,
  onConnectSaved,
  savedAccounts,
  isLoadingSavedAccounts,
  onLoadSavedAccounts,
  isSubmitting,
  prefillingSavedEmail,
  connectingSavedEmail
}: AccountFormProps) {
  const handleInputChange = (key: keyof AccountFormState, value: string) => {
    onFormStateChange(key, value);
  };

  const submitConnect = async () => {
    const payload = await invoke("connect_account", {
      provider: formState.provider,
      email: formState.email,
      password: formState.password,
      customHost: formState.customHost || undefined,
      customPort: formState.customPort ? parseInt(formState.customPort) : undefined
    });
    await onConnect(payload);
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={3}>
          <AddIcon color="primary" />
          <Typography variant="h6" component="h2">
            Add Account
          </Typography>
        </Box>

        <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Provider</InputLabel>
            <Select
              value={formState.provider}
              label="Provider"
              onChange={(event) =>
                handleInputChange("provider", event.target.value as Provider)
              }
            >
              {Object.entries(providerLabels).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Email address"
            type="email"
            autoComplete="username"
            placeholder="your.email@example.com"
            value={formState.email}
            onChange={(event) =>
              handleInputChange("email", event.target.value)
            }
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="App password or server password"
            value={formState.password}
            onChange={(event) =>
              handleInputChange("password", event.target.value)
            }
            helperText="For Yahoo: Generate via Account Security → Manage app passwords → Mail"
          />

          <TextField
            fullWidth
            label="Custom IMAP Host (optional)"
            placeholder="e.g., imap.example.com"
            value={formState.customHost || ""}
            onChange={(event) =>
              handleInputChange("customHost", event.target.value)
            }
          />

          <TextField
            fullWidth
            label="Custom IMAP Port (optional)"
            type="number"
            placeholder="993"
            value={formState.customPort || "993"}
            onChange={(event) =>
              handleInputChange("customPort", event.target.value)
            }
          />

          <Button
            variant="contained"
            color="primary"
            onClick={submitConnect}
            disabled={isSubmitting || !formState.email || !formState.password}
            startIcon={isSubmitting ? undefined : <LoginIcon />}
            sx={{ mt: 1 }}
          >
            {isSubmitting ? "Connecting..." : "Connect"}
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6" component="h3">
              Saved on this Mac
            </Typography>
            <IconButton
              onClick={onLoadSavedAccounts}
              disabled={isLoadingSavedAccounts}
              size="small"
            >
              <RefreshIcon />
            </IconButton>
          </Box>

          {isLoadingSavedAccounts ? (
            <Typography variant="body2" color="text.secondary">
              Loading saved accounts...
            </Typography>
          ) : savedAccounts.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1 }}>
              Saved accounts appear after you connect once and grant keychain access.
            </Alert>
          ) : (
            <List dense>
              {savedAccounts.map((saved) => (
                <ListItem key={saved.email} disablePadding>
                  <ListItemButton sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1 }}>
                    <Box display="flex" alignItems="center" gap={1} width="100%" mb={1}>
                      <Typography variant="body2" color="text.secondary">
                        {providerLabels[saved.provider]}
                      </Typography>
                      {!saved.has_password && (
                        <Chip label="Password needed" color="warning" size="small" />
                      )}
                    </Box>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      {saved.email}
                    </Typography>
                    <Box display="flex" gap={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onPrefill(saved)}
                        disabled={
                          prefillingSavedEmail === saved.email ||
                          connectingSavedEmail === saved.email
                        }
                      >
                        {prefillingSavedEmail === saved.email ? "Filling..." : "Fill form"}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => onConnectSaved(saved)}
                        disabled={
                          !saved.has_password || connectingSavedEmail === saved.email
                        }
                        startIcon={<CheckCircleIcon />}
                      >
                        {connectingSavedEmail === saved.email ? "Connecting..." : "Connect"}
                      </Button>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}