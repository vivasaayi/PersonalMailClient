import { useState } from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import type { Provider, SavedAccount, ConnectAccountResponse } from '../types';
import { useAccountsStore } from '../stores/accountsStore';
import { useNotifications } from '../stores/notifications';

interface ConnectionWizardProps {
  open: boolean;
  onClose: () => void;
  onConnected: (payload: {
    response: ConnectAccountResponse;
    source: 'new' | 'saved';
    savedAccount?: SavedAccount;
  }) => Promise<void> | void;
}

const steps = ['Select Provider', 'Enter Credentials', 'Verify & Connect'];

const providerOptions = [
  {
    value: 'gmail' as Provider,
    label: 'Gmail',
    description: 'Google Mail with OAuth',
    icon: '📧',
  },
  {
    value: 'outlook' as Provider,
    label: 'Outlook / Live',
    description: 'Microsoft Outlook and Live Mail',
    icon: '📧',
  },
  {
    value: 'yahoo' as Provider,
    label: 'Yahoo Mail',
    description: 'Yahoo Mail with app passwords',
    icon: '📧',
  },
  {
    value: 'custom' as Provider,
    label: 'Custom IMAP',
    description: 'Any IMAP-compatible server',
    icon: '⚙️',
  },
];

const providerGuidance: Record<Provider, {
  title: string;
  points: string[];
  footnote?: string;
}> = {
  gmail: {
    title: 'Google accounts require browser approval',
    points: [
      'OAuth consent will launch in a browser window the first time you connect.',
      '2-step verification must be enabled on the Google account.',
      'We only request read-only access to the inbox and label metadata.'
    ],
    footnote: 'Tip: Keep the browser window open until the wizard confirms the connection.'
  },
  outlook: {
    title: 'Use an Outlook app password for IMAP access',
    points: [
      'Generate an app password from https://account.microsoft.com/security if MFA is enabled.',
      'Ensure IMAP access is enabled in Outlook settings (Account Settings → IMAP Access).',
      'Testing the connection will validate your credentials before saving.'
    ],
    footnote: 'Need help? Follow Microsoft’s “Create app passwords” guide.'
  },
  yahoo: {
    title: 'Yahoo requires a dedicated app password',
    points: [
      'Visit https://login.yahoo.com/account/security to generate an app password.',
      'Copy the generated password exactly—Yahoo passwords are case sensitive.',
      'Testing the connection verifies the IMAP login before it is stored.'
    ],
    footnote: 'Yahoo app passwords expire if unused for 90 days; regenerate if a test fails.'
  },
  custom: {
    title: 'Bring your IMAP server details',
    points: [
      'Enter the server host name (e.g., mail.example.com) and SSL/TLS port (usually 993).',
      'We recommend using an app-specific password if your provider offers it.',
      'Testing the connection will confirm the IMAP handshake succeeds before saving.'
    ],
    footnote: 'If your server requires STARTTLS on port 143, update the advanced settings on the next step.'
  }
};

function ProviderGuidance({ provider }: { provider: Provider }) {
  const guidance = providerGuidance[provider];

  if (!guidance) {
    return null;
  }

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        boxShadow: '0 10px 30px -24px rgba(37,99,235,0.25)'
      }}
    >
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>{guidance.title}</h3>
      <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151', lineHeight: 1.5 }}>
        {guidance.points.map((point, index) => (
          <li key={index} style={{ marginBottom: '8px' }}>
            {point}
          </li>
        ))}
      </ul>
      {guidance.footnote && (
        <p style={{ margin: '16px 0 0 0', fontSize: '13px', color: '#6b7280' }}>{guidance.footnote}</p>
      )}
    </div>
  );
}

export default function ConnectionWizard({
  open,
  onClose,
  onConnected
}: ConnectionWizardProps) {
  const {
    savedAccounts,
    connectNewAccount,
    connectSavedAccount,
    connectingSavedEmail,
    testAccountConnection
  } = useAccountsStore();
  const { notifyError, notifySuccess } = useNotifications();
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    provider: 'yahoo' as Provider,
    email: '',
    password: '',
    customHost: '',
    customPort: 993,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verification, setVerification] = useState<{
    status: 'idle' | 'pending' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const updateFormData = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setVerification({ status: 'idle' });
  };

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
    setVerification({ status: 'idle' });
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
    if (verification.status !== 'success') {
      notifyError('Please test the connection before connecting.');
      return;
    }
    if (!validateStep(activeStep)) return;

    try {
      setIsSubmitting(true);
      const response = await connectNewAccount({
        provider: formData.provider,
        email: formData.email,
        password: formData.password,
        customHost: formData.provider === 'custom' ? formData.customHost : undefined,
        customPort: formData.provider === 'custom' ? formData.customPort : undefined,
      });
      handleReset();
      onClose();
      await onConnected({ response, source: 'new' });
    } catch (error) {
      notifyError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyConnection = async () => {
    if (!validateStep(1)) {
      setActiveStep(1);
      return;
    }

    setVerification({ status: 'pending' });
    try {
      await testAccountConnection({
        provider: formData.provider,
        email: formData.email.trim(),
        password: formData.password.trim() ? formData.password : undefined,
        customHost: formData.provider === 'custom' ? formData.customHost.trim() || undefined : undefined,
        customPort: formData.provider === 'custom' ? formData.customPort : undefined,
      });
      const message = 'Successfully authenticated with the mailbox.';
      setVerification({ status: 'success', message });
      notifySuccess('Connection verified.');
    } catch (error) {
      const message = errorMessage(error);
      setVerification({ status: 'error', message });
      notifyError(message);
    }
  };

  const handleSavedAccountSelect = async (saved: SavedAccount) => {
    try {
      const response = await connectSavedAccount(saved);
  handleReset();
  await onConnected({ response, source: 'saved', savedAccount: saved });
      onClose();
    } catch (error) {
      notifyError(errorMessage(error));
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div style={{ marginTop: '16px', display: 'grid', gap: '24px', gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
              Choose Your Email Provider
            </h2>
            <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: '14px' }}>
              Select the email service you want to connect to. We'll guide you through the setup process.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {providerOptions.map((option) => (
                <div
                  key={option.value}
                  style={{
                    padding: '16px',
                    border: formData.provider === option.value ? '2px solid #1976d2' : '1px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formData.provider === option.value ? '#f3f9ff' : 'white',
                    boxShadow: formData.provider === option.value ? '0 2px 8px rgba(25, 118, 210, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => updateFormData({ provider: option.value })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '24px' }}>{option.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>
                        {option.label}
                      </div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {option.description}
                      </div>
                    </div>
                    {formData.provider === option.value && (
                      <span style={{ color: '#1976d2', fontSize: '20px' }}>✓</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <ProviderGuidance provider={formData.provider} />

            {savedAccounts.length > 0 && (
              <div>
                <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #ddd' }} />
                <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold' }}>
                  Quick Connect - Saved Accounts
                </h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {savedAccounts.map((saved) => (
                    <li key={saved.email} style={{ marginBottom: '8px' }}>
                      <button
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                          cursor: connectingSavedEmail === saved.email ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          opacity: connectingSavedEmail === saved.email ? 0.6 : 1
                        }}
                        onClick={() => handleSavedAccountSelect(saved)}
                        disabled={connectingSavedEmail === saved.email}
                      >
                        <span style={{ fontSize: '20px' }}>👤</span>
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontWeight: '500' }}>{saved.email}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {saved.provider} {saved.has_password ? '(saved password)' : '(password required)'}
                          </div>
                        </div>
                        {connectingSavedEmail === saved.email && (
                          <span style={{ fontSize: '12px', color: '#1976d2' }}>Connecting...</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div style={{ marginTop: '16px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
              Enter Your Credentials
            </h2>
            <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: '14px' }}>
              Provide your email credentials. For security, we recommend using app passwords when available.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Email input */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData({ email: e.target.value })}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: errors.email ? '1px solid #f44336' : '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
                {errors.email && (
                  <div style={{ color: '#f44336', fontSize: '12px', marginTop: '4px' }}>
                    {errors.email}
                  </div>
                )}
              </div>

              {/* Password input (only for non-Gmail) */}
              {formData.provider !== 'gmail' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData({ password: e.target.value })}
                    disabled={isSubmitting}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: errors.password ? '1px solid #f44336' : '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{
                    color: errors.password ? '#f44336' : '#666',
                    fontSize: '12px',
                    marginTop: '4px'
                  }}>
                    {errors.password || 'Use app password for better security'}
                  </div>
                </div>
              )}

              {/* Custom IMAP settings */}
              {formData.provider === 'custom' && (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      IMAP Host
                    </label>
                    <input
                      type="text"
                      value={formData.customHost}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData({ customHost: e.target.value })}
                      placeholder="imap.example.com"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: errors.customHost ? '1px solid #f44336' : '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{
                      color: errors.customHost ? '#f44336' : '#666',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}>
                      {errors.customHost || 'e.g., imap.gmail.com'}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      IMAP Port
                    </label>
                    <input
                      type="number"
                      value={formData.customPort}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateFormData({ customPort: parseInt(e.target.value) || 993 })}
                      min={1}
                      max={65535}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: errors.customPort ? '1px solid #f44336' : '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{
                      color: errors.customPort ? '#f44336' : '#666',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}>
                      {errors.customPort || 'Usually 993 for SSL/TLS'}
                    </div>
                  </div>
                </div>
              )}

              {/* Security note */}
              <div style={{
                padding: '16px',
                backgroundColor: '#e3f2fd',
                border: '1px solid #bbdefb',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <span style={{ fontSize: '20px' }}>🔒</span>
                <div style={{ fontSize: '14px', color: '#0d47a1' }}>
                  <strong>Security Note:</strong> Your credentials are stored securely in your system's keychain and are only used to connect to your email server.
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div style={{ marginTop: '16px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>
              Review Connection Details
            </h2>
            <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: '14px' }}>
              Please review your connection settings before connecting.
            </p>

            <div style={{
              padding: '24px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Provider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '20px', color: '#1976d2' }}>📧</span>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      Provider
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '500' }}>
                      {providerOptions.find(p => p.value === formData.provider)?.label}
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '20px', color: '#1976d2' }}>👤</span>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      Email Address
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '500' }}>
                      {formData.email}
                    </div>
                  </div>
                </div>

                {/* Custom server (if applicable) */}
                {formData.provider === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '20px', color: '#1976d2' }}>⚙️</span>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        IMAP Server
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: '500' }}>
                        {formData.customHost}:{formData.customPort}
                      </div>
                    </div>
                  </div>
                )}

                {/* Authentication */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '20px', color: '#1976d2' }}>🔑</span>
                  <div>
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                      Authentication
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '500' }}>
                      {formData.password ? 'Password provided' : 'OAuth (Gmail)'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              padding: '24px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>Step 3: Verify connection</h3>
                <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
                  We&apos;ll attempt to log in with the credentials above and confirm the inbox is reachable before saving anything.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <ButtonComponent
                  cssClass="e-primary"
                  onClick={handleVerifyConnection}
                  disabled={verification.status === 'pending'}
                >
                  {verification.status === 'pending' ? 'Testing…' : 'Test Connection'}
                </ButtonComponent>
                {verification.status === 'idle' && (
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    Run the test to unlock the Connect button.
                  </span>
                )}
                {verification.status === 'pending' && (
                  <span style={{ fontSize: '13px', color: '#1d4ed8' }}>
                    Attempting to authenticate with the IMAP server…
                  </span>
                )}
                {verification.status === 'success' && (
                  <span style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>
                    {verification.message ?? 'Connection verified successfully.'}
                  </span>
                )}
                {verification.status === 'error' && (
                  <span style={{ fontSize: '13px', color: '#b91c1c' }}>
                    {verification.message ?? 'Verification failed. Please review your credentials.'}
                  </span>
                )}
              </div>
            </div>

            {/* Warning alert */}
            <div style={{
              padding: '16px',
              backgroundColor: '#fff3e0',
              border: '1px solid #ffcc02',
              borderRadius: '4px'
            }}>
              <div style={{ fontSize: '14px', color: '#e65100' }}>
                <strong>Warning:</strong> Make sure your email account has IMAP enabled and you have the correct credentials before connecting.
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DialogComponent
      isModal={true}
      visible={open}
      width="80%"
      height="auto"
      showCloseIcon={true}
      closeOnEscape={!isSubmitting && verification.status !== 'pending'}
      close={onClose}
      header="Connect Email Account"
      content={() => (
        <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Stepper */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '32px',
            padding: '0 16px'
          }}>
            {steps.map((label, index) => (
              <div key={`step-${index}`} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: index === activeStep ? '#e3f2fd' : index < activeStep ? '#e8f5e8' : '#f5f5f5',
                margin: '0 4px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: index <= activeStep ? '#1976d2' : '#bdbdbd',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  marginBottom: '8px'
                }}>
                  {index < activeStep ? '✓' : (index + 1).toString()}
                </div>
                <div style={{
                  fontSize: '12px',
                  textAlign: 'center',
                  color: index <= activeStep ? '#1976d2' : '#666'
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          {/* Step content */}
          {renderStepContent(activeStep)}
        </div>
      )}
      footerTemplate={() => (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px',
          borderTop: '1px solid #e0e0e0'
        }}>
          <ButtonComponent
            cssClass="e-outline"
            onClick={activeStep === 0 ? onClose : handleBack}
            disabled={isSubmitting}
          >
            {activeStep === 0 ? 'Cancel' : 'Back'}
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-primary"
            onClick={activeStep === steps.length - 1 ? handleConnect : handleNext}
            disabled={
              isSubmitting ||
              verification.status === 'pending' ||
              (activeStep === steps.length - 1 && verification.status !== 'success')
            }
          >
            {activeStep === steps.length - 1
              ? (isSubmitting ? 'Connecting...' : 'Connect')
              : 'Next'}
          </ButtonComponent>
        </div>
      )}
    />
  );
}