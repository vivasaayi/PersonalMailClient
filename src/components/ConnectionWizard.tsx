import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  AccountCircle as AccountIcon,
  Security as SecurityIcon,
  CheckCircle as CheckIcon,
  Email as EmailIcon,
  VpnKey as KeyIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import type { Provider, SavedAccount } from '../types';

interface ConnectionWizardProps {
  open: boolean;
  onClose: () => void;
  onConnect: (formData: {
    provider: Provider;
    email: string;
    password: string;
    customHost?: string;
    customPort?: number;
  }) => Promise<void>;
  onConnectSaved: (saved: SavedAccount) => Promise<void>;
  savedAccounts: SavedAccount[];
  isSubmitting: boolean;
  prefillingSavedEmail: string | null;
  connectingSavedEmail: string | null;
}

const steps = ['Select Provider', 'Enter Credentials', 'Review & Connect'];

const providerOptions = [
  {
    value: 'gmail' as Provider,
    label: 'Gmail',
    description: 'Google Mail with OAuth',
    icon: <EmailIcon />,
  },
  {
    value: 'outlook' as Provider,
    label: 'Outlook / Live',
    description: 'Microsoft Outlook and Live Mail',
    icon: <EmailIcon />,
  },
  {
    value: 'yahoo' as Provider,
    label: 'Yahoo Mail',
    description: 'Yahoo Mail with app passwords',
    icon: <EmailIcon />,
  },
  {
    value: 'custom' as Provider,
    label: 'Custom IMAP',
    description: 'Any IMAP-compatible server',
    icon: <SettingsIcon />,
  },
];

export default function ConnectionWizard({
  open,
  onClose,
  onConnect,
  onConnectSaved,
  savedAccounts,
  isSubmitting,
  prefillingSavedEmail,
  connectingSavedEmail,
}: ConnectionWizardProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    provider: 'yahoo' as Provider,
    email: '',
    password: '',
    customHost: '',
    customPort: 993,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setFormData({
      provider: 'yahoo' as Provider,
      email: '',
      password: '',
      customHost: '',
      customPort: 993,
    });
    setErrors({});
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0:
        if (!formData.provider) {
          newErrors.provider = 'Please select a provider';
        }
        break;
      case 1:
        if (!formData.email) {
          newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
          newErrors.email = 'Please enter a valid email address';
        }
        if (!formData.password && formData.provider !== 'gmail') {
          newErrors.password = 'Password is required';
        }
        if (formData.provider === 'custom') {
          if (!formData.customHost) {
            newErrors.customHost = 'IMAP host is required';
          }
          if (!formData.customPort || formData.customPort < 1 || formData.customPort > 65535) {
            newErrors.customPort = 'Please enter a valid port number (1-65535)';
          }
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConnect = async () => {
    if (!validateStep(activeStep)) return;

    try {
      await onConnect({
        provider: formData.provider,
        email: formData.email,
        password: formData.password,
        customHost: formData.provider === 'custom' ? formData.customHost : undefined,
        customPort: formData.provider === 'custom' ? formData.customPort : undefined,
      });
      handleReset();
      onClose();
    } catch (error) {
      // Error handling is done in the parent component
    }
  };

  const handleSavedAccountSelect = async (saved: SavedAccount) => {
    try {
      await onConnectSaved(saved);
      onClose();
    } catch (error) {
      // Error handling is done in the parent component
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Choose Your Email Provider
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select the email service you want to connect to. We'll guide you through the setup process.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {providerOptions.map((option) => (
                <Paper
                  key={option.value}
                  elevation={formData.provider === option.value ? 4 : 1}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    border: formData.provider === option.value ? 2 : 1,
                    borderColor: formData.provider === option.value ? 'primary.main' : 'divider',
                    transition: 'all 0.2s',
                    '&:hover': {
                      elevation: 2,
                    },
                  }}
                  onClick={() => setFormData({ ...formData, provider: option.value })}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {option.icon}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {option.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.description}
                      </Typography>
                    </Box>
                    {formData.provider === option.value && (
                      <CheckIcon color="primary" />
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>

            {savedAccounts.length > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" gutterBottom>
                  Quick Connect - Saved Accounts
                </Typography>
                <List>
                  {savedAccounts.map((saved) => (
                    <ListItem key={saved.email} disablePadding>
                      <ListItemButton
                        onClick={() => handleSavedAccountSelect(saved)}
                        disabled={connectingSavedEmail === saved.email}
                        sx={{ borderRadius: 1 }}
                      >
                        <ListItemIcon>
                          <AccountIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={saved.email}
                          secondary={`${saved.provider} ${saved.has_password ? '(saved password)' : '(password required)'}`}
                        />
                        {connectingSavedEmail === saved.email && (
                          <Typography variant="caption" color="primary">
                            Connecting...
                          </Typography>
                        )}
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Box>
        );

      case 1:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Enter Your Credentials
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Provide your email credentials. For security, we recommend using app passwords when available.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={!!errors.email}
                helperText={errors.email}
                disabled={prefillingSavedEmail === formData.email}
              />

              {formData.provider !== 'gmail' && (
                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={!!errors.password}
                  helperText={errors.password || 'Use app password for better security'}
                  disabled={prefillingSavedEmail === formData.email}
                />
              )}

              {formData.provider === 'custom' && (
                <>
                  <TextField
                    fullWidth
                    label="IMAP Host"
                    value={formData.customHost}
                    onChange={(e) => setFormData({ ...formData, customHost: e.target.value })}
                    error={!!errors.customHost}
                    helperText={errors.customHost || 'e.g., imap.gmail.com'}
                    placeholder="imap.example.com"
                  />

                  <TextField
                    fullWidth
                    label="IMAP Port"
                    type="number"
                    value={formData.customPort}
                    onChange={(e) => setFormData({ ...formData, customPort: parseInt(e.target.value) || 993 })}
                    error={!!errors.customPort}
                    helperText={errors.customPort || 'Usually 993 for SSL/TLS'}
                    inputProps={{ min: 1, max: 65535 }}
                  />
                </>
              )}

              <Alert severity="info" icon={<SecurityIcon />}>
                <Typography variant="body2">
                  <strong>Security Note:</strong> Your credentials are stored securely in your system's keychain and are only used to connect to your email server.
                </Typography>
              </Alert>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Review Connection Details
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Please review your connection settings before connecting.
            </Typography>

            <Paper sx={{ p: 3, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <EmailIcon color="primary" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Provider
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {providerOptions.find(p => p.value === formData.provider)?.label}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AccountIcon color="primary" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Email Address
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {formData.email}
                    </Typography>
                  </Box>
                </Box>

                {formData.provider === 'custom' && (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <SettingsIcon color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          IMAP Server
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {formData.customHost}:{formData.customPort}
                        </Typography>
                      </Box>
                    </Box>
                  </>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <KeyIcon color="primary" />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Authentication
                    </Typography>
                    <Typography variant="body1" fontWeight="medium">
                      {formData.password ? 'Password provided' : 'OAuth (Gmail)'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Paper>

            <Alert severity="warning" sx={{ mt: 3 }}>
              <Typography variant="body2">
                Make sure your email account has IMAP enabled and you have the correct credentials before connecting.
              </Typography>
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={isSubmitting}
    >
      <DialogTitle>
        <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
          Connect Email Account
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {renderStepContent(activeStep)}
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button
          onClick={activeStep === 0 ? onClose : handleBack}
          disabled={isSubmitting}
        >
          {activeStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        <Button
          variant="contained"
          onClick={activeStep === steps.length - 1 ? handleConnect : handleNext}
          disabled={isSubmitting}
        >
          {activeStep === steps.length - 1
            ? (isSubmitting ? 'Connecting...' : 'Connect')
            : 'Next'
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}