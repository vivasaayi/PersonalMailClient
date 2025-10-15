import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Chip,
  Avatar,
} from '@mui/material';
import {
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  Mail as MailIcon,
  Block as BlockIcon,
  Sync as SyncIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';
import type { Account } from '../types';

const DRAWER_WIDTH = 280;

interface NavigationDrawerProps {
  open: boolean;
  accounts: Account[];
  selectedAccount: string | null;
  onAccountSelect: (email: string | null) => void;
  onNavigate: (view: string) => void;
  currentView: string;
}

export default function NavigationDrawer({
  open,
  accounts,
  selectedAccount,
  onAccountSelect,
  onNavigate,
  currentView,
}: NavigationDrawerProps) {
  const menuItems = [
    {
      id: 'mailbox',
      label: 'Mailbox',
      icon: <InboxIcon />,
      disabled: !selectedAccount,
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: <TuneIcon />,
      disabled: !selectedAccount,
    },
    {
      id: 'sync',
      label: 'Sync Settings',
      icon: <SyncIcon />,
      disabled: !selectedAccount,
    },
    {
      id: 'blocked',
      label: 'Blocked Senders',
      icon: <BlockIcon />,
      disabled: !selectedAccount,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SettingsIcon />,
      disabled: false,
    },
  ];

  return (
    <Drawer
      variant="persistent"
      anchor="left"
      open={open}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderRightColor: 'divider',
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
          Personal Mail Client
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Enterprise Email Management
        </Typography>
      </Box>

      {/* Accounts Section */}
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'medium' }}>
          Connected Accounts
        </Typography>
        <List dense>
          {accounts.length === 0 ? (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary">
                    No accounts connected
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            accounts.map((account) => (
              <ListItem key={account.email} disablePadding>
                <ListItemButton
                  selected={selectedAccount === account.email}
                  onClick={() => onAccountSelect(account.email)}
                  sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Avatar sx={{ width: 24, height: 24 }}>
                      <MailIcon sx={{ fontSize: 16 }} />
                    </Avatar>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" noWrap>
                        {account.display_name || account.email}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {account.email}
                      </Typography>
                    }
                  />
                  {selectedAccount === account.email && (
                    <Chip
                      label="Active"
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  )}
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </Box>

      <Divider />

      {/* Navigation Menu */}
      <Box sx={{ flex: 1 }}>
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                selected={currentView === item.id}
                disabled={item.disabled}
                onClick={() => onNavigate(item.id)}
                sx={{ mx: 1, mb: 0.5, borderRadius: 1 }}
              >
                <ListItemIcon sx={{ color: item.disabled ? 'text.disabled' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      color={item.disabled ? 'text.disabled' : 'text.primary'}
                    >
                      {item.label}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider />

      {/* Footer */}
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
          v1.0.0
        </Typography>
      </Box>
    </Drawer>
  );
}