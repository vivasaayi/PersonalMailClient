import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Alert,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Storage as StorageIcon,
  Sync as SyncIcon,
  Palette as ThemeIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

interface SettingsViewProps {
  // Add props as needed for settings functionality
}

const SettingsView: React.FC<SettingsViewProps> = () => {
  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
        Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Manage your email client preferences and configuration.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Security Settings */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <SecurityIcon />
              </Avatar>
            }
            title="Security"
            subheader="Manage authentication and privacy settings"
          />
          <CardContent>
            <List>
              <ListItem>
                <ListItemIcon>
                  <SecurityIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Store Passwords"
                  secondary="Save passwords securely in system keychain"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label=""
                />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemIcon>
                  <SecurityIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Auto-lock"
                  secondary="Automatically lock after inactivity"
                />
                <FormControlLabel
                  control={<Switch />}
                  label=""
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'secondary.main' }}>
                <NotificationsIcon />
              </Avatar>
            }
            title="Notifications"
            subheader="Configure email and system notifications"
          />
          <CardContent>
            <List>
              <ListItem>
                <ListItemIcon>
                  <NotificationsIcon />
                </ListItemIcon>
                <ListItemText
                  primary="New Email Alerts"
                  secondary="Show notifications for new messages"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label=""
                />
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemIcon>
                  <NotificationsIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Sync Completion"
                  secondary="Notify when sync operations complete"
                />
                <FormControlLabel
                  control={<Switch defaultChecked />}
                  label=""
                />
              </ListItem>
            </List>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'success.main' }}>
                <StorageIcon />
              </Avatar>
            }
            title="Storage"
            subheader="Manage cached data and storage usage"
          />
          <CardContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Cache Size
              </Typography>
              <Typography variant="h6">
                2.4 GB used
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last cleaned: 2 days ago
              </Typography>
            </Box>

            <Button variant="outlined" fullWidth>
              Clear Cache
            </Button>
          </CardContent>
        </Card>

        {/* Sync Settings */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'info.main' }}>
                <SyncIcon />
              </Avatar>
            }
            title="Sync Configuration"
            subheader="Default sync preferences for new accounts"
          />
          <CardContent>
            <List>
              <ListItem>
                <ListItemText
                  primary="Auto-sync Interval"
                  secondary="How often to check for new emails (minutes)"
                />
                <Typography variant="body2" sx={{ ml: 2 }}>
                  30 minutes
                </Typography>
              </ListItem>
              <Divider />
              <ListItem>
                <ListItemText
                  primary="Batch Size"
                  secondary="Messages to fetch per sync operation"
                />
                <Typography variant="body2" sx={{ ml: 2 }}>
                  50 messages
                </Typography>
              </ListItem>
            </List>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'warning.main' }}>
                <ThemeIcon />
              </Avatar>
            }
            title="Appearance"
            subheader="Customize the look and feel of the application"
          />
          <CardContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Theme customization will be available in a future update. Currently using the default dark theme optimized for email management.
              </Typography>
            </Alert>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'grey.500' }}>
                <InfoIcon />
              </Avatar>
            }
            title="About Personal Mail Client"
            subheader="Version 1.0.0"
          />
          <CardContent>
            <Typography variant="body2" paragraph>
              A professional email management application built with Tauri and React.
              Features enterprise-grade email filtering, automated organization, and secure credential management.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button variant="outlined" size="small">
                Check for Updates
              </Button>
              <Button variant="outlined" size="small">
                View Changelog
              </Button>
              <Button variant="outlined" size="small">
                Report Issue
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default SettingsView;