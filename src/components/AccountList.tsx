import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Box,
  Chip
} from "@mui/material";
import {
  Email as EmailIcon,
  Delete as DeleteIcon,
  CheckCircle as ActiveIcon
} from "@mui/icons-material";
import type { Account, Provider } from "../types";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

interface AccountListProps {
  accounts: Account[];
  selectedAccount: string | null;
  onSelectAccount: (email: string) => void;
  onDisconnect: (email: string) => Promise<void>;
  removingAccount: string | null;
}

export default function AccountList({
  accounts,
  selectedAccount,
  onSelectAccount,
  onDisconnect,
  removingAccount
}: AccountListProps) {
  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <EmailIcon color="primary" />
          <Typography variant="h6" component="h2">
            Connected Accounts
          </Typography>
        </Box>

        {accounts.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No accounts connected yet.
          </Typography>
        ) : (
          <List>
            {accounts.map((account) => (
              <ListItem
                key={account.email}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDisconnect(account.email);
                    }}
                    disabled={removingAccount === account.email}
                    color="error"
                    size="small"
                  >
                    {removingAccount === account.email ? (
                      <Typography variant="caption">...</Typography>
                    ) : (
                      <DeleteIcon fontSize="small" />
                    )}
                  </IconButton>
                }
                disablePadding
              >
                <ListItemButton
                  onClick={() => onSelectAccount(account.email)}
                  selected={account.email === selectedAccount}
                  sx={{
                    borderRadius: 1,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={providerLabels[account.provider]}
                          size="small"
                          color={account.email === selectedAccount ? "secondary" : "default"}
                          variant={account.email === selectedAccount ? "filled" : "outlined"}
                        />
                        {account.email === selectedAccount && <ActiveIcon fontSize="small" />}
                      </Box>
                    }
                    secondary={account.email}
                    secondaryTypographyProps={{
                      color: account.email === selectedAccount ? 'inherit' : 'text.secondary'
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}