import React, { useState, createElement } from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
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
        return createElement('div', { style: { marginTop: '16px' } }, [
          createElement('h2', {
            key: 'title',
            style: { margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }
          }, 'Choose Your Email Provider'),
          createElement('p', {
            key: 'description',
            style: { margin: '0 0 24px 0', color: '#666', fontSize: '14px' }
          }, 'Select the email service you want to connect to. We\'ll guide you through the setup process.'),

          createElement('div', {
            key: 'providers',
            style: { display: 'flex', flexDirection: 'column', gap: '16px' }
          }, providerOptions.map((option) =>
            createElement('div', {
              key: option.value,
              style: {
                padding: '16px',
                border: formData.provider === option.value ? '2px solid #1976d2' : '1px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: formData.provider === option.value ? '#f3f9ff' : 'white',
                boxShadow: formData.provider === option.value ? '0 2px 8px rgba(25, 118, 210, 0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
              },
              onClick: () => setFormData({ ...formData, provider: option.value })
            }, createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: '16px' }
            }, [
              createElement('span', {
                key: 'icon',
                style: { fontSize: '24px' }
              }, option.icon),
              createElement('div', {
                key: 'content',
                style: { flex: 1 }
              }, [
                createElement('div', {
                  key: 'label',
                  style: { fontSize: '16px', fontWeight: '500', marginBottom: '4px' }
                }, option.label),
                createElement('div', {
                  key: 'description',
                  style: { fontSize: '14px', color: '#666' }
                }, option.description)
              ]),
              formData.provider === option.value && createElement('span', {
                key: 'check',
                style: { color: '#1976d2', fontSize: '20px' }
              }, '✓')
            ]))
          )),

          savedAccounts.length > 0 && createElement('div', { key: 'saved-accounts' }, [
            createElement('hr', {
              key: 'divider',
              style: { margin: '32px 0', border: 'none', borderTop: '1px solid #ddd' }
            }),
            createElement('h2', {
              key: 'saved-title',
              style: { margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold' }
            }, 'Quick Connect - Saved Accounts'),
            createElement('ul', {
              key: 'saved-list',
              style: { listStyle: 'none', padding: 0, margin: 0 }
            }, savedAccounts.map((saved) =>
              createElement('li', {
                key: saved.email,
                style: { marginBottom: '8px' }
              }, createElement('button', {
                style: {
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
                },
                onClick: () => handleSavedAccountSelect(saved),
                disabled: connectingSavedEmail === saved.email
              }, [
                createElement('span', {
                  key: 'icon',
                  style: { fontSize: '20px' }
                }, '👤'),
                createElement('div', {
                  key: 'content',
                  style: { flex: 1, textAlign: 'left' }
                }, [
                  createElement('div', {
                    key: 'email',
                    style: { fontWeight: '500' }
                  }, saved.email),
                  createElement('div', {
                    key: 'details',
                    style: { fontSize: '12px', color: '#666' }
                  }, `${saved.provider} ${saved.has_password ? '(saved password)' : '(password required)'}`)
                ]),
                connectingSavedEmail === saved.email && createElement('span', {
                  key: 'connecting',
                  style: { fontSize: '12px', color: '#1976d2' }
                }, 'Connecting...')
              ]))
            ))
          ])
        ]);

      case 1:
        return createElement('div', { style: { marginTop: '16px' } }, [
          createElement('h2', {
            key: 'title',
            style: { margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }
          }, 'Enter Your Credentials'),
          createElement('p', {
            key: 'description',
            style: { margin: '0 0 24px 0', color: '#666', fontSize: '14px' }
          }, 'Provide your email credentials. For security, we recommend using app passwords when available.'),

          createElement('div', {
            key: 'form',
            style: { display: 'flex', flexDirection: 'column', gap: '24px' }
          }, [
            // Email input
            createElement('div', { key: 'email-group' }, [
              createElement('label', {
                key: 'email-label',
                style: { display: 'block', marginBottom: '8px', fontWeight: '500' }
              }, 'Email Address'),
              createElement('input', {
                key: 'email-input',
                type: 'email',
                value: formData.email,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, email: e.target.value }),
                disabled: prefillingSavedEmail === formData.email,
                style: {
                  width: '100%',
                  padding: '12px',
                  border: errors.email ? '1px solid #f44336' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }
              }),
              errors.email && createElement('div', {
                key: 'email-error',
                style: { color: '#f44336', fontSize: '12px', marginTop: '4px' }
              }, errors.email)
            ]),

            // Password input (only for non-Gmail)
            formData.provider !== 'gmail' && createElement('div', { key: 'password-group' }, [
              createElement('label', {
                key: 'password-label',
                style: { display: 'block', marginBottom: '8px', fontWeight: '500' }
              }, 'Password'),
              createElement('input', {
                key: 'password-input',
                type: 'password',
                value: formData.password,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, password: e.target.value }),
                disabled: prefillingSavedEmail === formData.email,
                style: {
                  width: '100%',
                  padding: '12px',
                  border: errors.password ? '1px solid #f44336' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }
              }),
              createElement('div', {
                key: 'password-help',
                style: {
                  color: errors.password ? '#f44336' : '#666',
                  fontSize: '12px',
                  marginTop: '4px'
                }
              }, errors.password || 'Use app password for better security')
            ]),

            // Custom IMAP settings
            formData.provider === 'custom' && createElement('div', { key: 'custom-settings' }, [
              createElement('div', { key: 'host-group', style: { marginBottom: '16px' } }, [
                createElement('label', {
                  key: 'host-label',
                  style: { display: 'block', marginBottom: '8px', fontWeight: '500' }
                }, 'IMAP Host'),
                createElement('input', {
                  key: 'host-input',
                  type: 'text',
                  value: formData.customHost,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, customHost: e.target.value }),
                  placeholder: 'imap.example.com',
                  style: {
                    width: '100%',
                    padding: '12px',
                    border: errors.customHost ? '1px solid #f44336' : '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }
                }),
                createElement('div', {
                  key: 'host-help',
                  style: {
                    color: errors.customHost ? '#f44336' : '#666',
                    fontSize: '12px',
                    marginTop: '4px'
                  }
                }, errors.customHost || 'e.g., imap.gmail.com')
              ]),

              createElement('div', { key: 'port-group' }, [
                createElement('label', {
                  key: 'port-label',
                  style: { display: 'block', marginBottom: '8px', fontWeight: '500' }
                }, 'IMAP Port'),
                createElement('input', {
                  key: 'port-input',
                  type: 'number',
                  value: formData.customPort,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, customPort: parseInt(e.target.value) || 993 }),
                  min: 1,
                  max: 65535,
                  style: {
                    width: '100%',
                    padding: '12px',
                    border: errors.customPort ? '1px solid #f44336' : '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }
                }),
                createElement('div', {
                  key: 'port-help',
                  style: {
                    color: errors.customPort ? '#f44336' : '#666',
                    fontSize: '12px',
                    marginTop: '4px'
                  }
                }, errors.customPort || 'Usually 993 for SSL/TLS')
              ])
            ]),

            // Security note
            createElement('div', {
              key: 'security-note',
              style: {
                padding: '16px',
                backgroundColor: '#e3f2fd',
                border: '1px solid #bbdefb',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }
            }, [
              createElement('span', {
                key: 'security-icon',
                style: { fontSize: '20px' }
              }, '🔒'),
              createElement('div', {
                key: 'security-text',
                style: { fontSize: '14px', color: '#0d47a1' }
              }, createElement('strong', {}, 'Security Note:'), ' Your credentials are stored securely in your system\'s keychain and are only used to connect to your email server.')
            ])
          ])
        ]);

      case 2:
        return createElement('div', { style: { marginTop: '16px' } }, [
          createElement('h2', {
            key: 'title',
            style: { margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }
          }, 'Review Connection Details'),
          createElement('p', {
            key: 'description',
            style: { margin: '0 0 24px 0', color: '#666', fontSize: '14px' }
          }, 'Please review your connection settings before connecting.'),

          createElement('div', {
            key: 'review-card',
            style: {
              padding: '24px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              marginBottom: '24px'
            }
          }, createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '16px' }
          }, [
            // Provider
            createElement('div', {
              key: 'provider-row',
              style: { display: 'flex', alignItems: 'center', gap: '16px' }
            }, [
              createElement('span', {
                key: 'provider-icon',
                style: { fontSize: '20px', color: '#1976d2' }
              }, '📧'),
              createElement('div', { key: 'provider-content' }, [
                createElement('div', {
                  key: 'provider-label',
                  style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
                }, 'Provider'),
                createElement('div', {
                  key: 'provider-value',
                  style: { fontSize: '16px', fontWeight: '500' }
                }, providerOptions.find(p => p.value === formData.provider)?.label)
              ])
            ]),

            // Email
            createElement('div', {
              key: 'email-row',
              style: { display: 'flex', alignItems: 'center', gap: '16px' }
            }, [
              createElement('span', {
                key: 'email-icon',
                style: { fontSize: '20px', color: '#1976d2' }
              }, '👤'),
              createElement('div', { key: 'email-content' }, [
                createElement('div', {
                  key: 'email-label',
                  style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
                }, 'Email Address'),
                createElement('div', {
                  key: 'email-value',
                  style: { fontSize: '16px', fontWeight: '500' }
                }, formData.email)
              ])
            ]),

            // Custom server (if applicable)
            formData.provider === 'custom' && createElement('div', {
              key: 'server-row',
              style: { display: 'flex', alignItems: 'center', gap: '16px' }
            }, [
              createElement('span', {
                key: 'server-icon',
                style: { fontSize: '20px', color: '#1976d2' }
              }, '⚙️'),
              createElement('div', { key: 'server-content' }, [
                createElement('div', {
                  key: 'server-label',
                  style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
                }, 'IMAP Server'),
                createElement('div', {
                  key: 'server-value',
                  style: { fontSize: '16px', fontWeight: '500' }
                }, `${formData.customHost}:${formData.customPort}`)
              ])
            ]),

            // Authentication
            createElement('div', {
              key: 'auth-row',
              style: { display: 'flex', alignItems: 'center', gap: '16px' }
            }, [
              createElement('span', {
                key: 'auth-icon',
                style: { fontSize: '20px', color: '#1976d2' }
              }, '🔑'),
              createElement('div', { key: 'auth-content' }, [
                createElement('div', {
                  key: 'auth-label',
                  style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
                }, 'Authentication'),
                createElement('div', {
                  key: 'auth-value',
                  style: { fontSize: '16px', fontWeight: '500' }
                }, formData.password ? 'Password provided' : 'OAuth (Gmail)')
              ])
            ])
          ])),

          // Warning alert
          createElement('div', {
            key: 'warning-alert',
            style: {
              padding: '16px',
              backgroundColor: '#fff3e0',
              border: '1px solid #ffcc02',
              borderRadius: '4px'
            }
          }, createElement('div', {
            style: { fontSize: '14px', color: '#e65100' }
          }, createElement('strong', {}, 'Warning:'), ' Make sure your email account has IMAP enabled and you have the correct credentials before connecting.'))
        ]);

      default:
        return null;
    }
  };

  return createElement(DialogComponent, {
    isModal: true,
    visible: open,
    width: '80%',
    height: 'auto',
    showCloseIcon: true,
    closeOnEscape: !isSubmitting,
    close: onClose,
    header: createElement('div', {
      style: { fontSize: '20px', fontWeight: 'bold', padding: '16px' }
    }, 'Connect Email Account'),
    content: createElement('div', { style: { padding: '16px' } }, [
      // Stepper
      createElement('div', {
        key: 'stepper',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '32px',
          padding: '0 16px'
        }
      }, steps.map((label, index) =>
        createElement('div', {
          key: `step-${index}`,
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: 1,
            padding: '8px',
            borderRadius: '4px',
            backgroundColor: index === activeStep ? '#e3f2fd' : index < activeStep ? '#e8f5e8' : '#f5f5f5',
            margin: '0 4px'
          }
        }, [
          createElement('div', {
            key: 'circle',
            style: {
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
            }
          }, index < activeStep ? '✓' : (index + 1).toString()),
          createElement('div', {
            key: 'label',
            style: {
              fontSize: '12px',
              textAlign: 'center',
              color: index <= activeStep ? '#1976d2' : '#666'
            }
          }, label)
        ])
      )),
      // Step content
      renderStepContent(activeStep)
    ]),
    footerTemplate: createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '16px',
        borderTop: '1px solid #e0e0e0'
      }
    }, [
      createElement(ButtonComponent, {
        key: 'cancel-back',
        cssClass: 'e-outline',
        onClick: activeStep === 0 ? onClose : handleBack,
        disabled: isSubmitting
      }, activeStep === 0 ? 'Cancel' : 'Back'),
      createElement(ButtonComponent, {
        key: 'next-connect',
        cssClass: 'e-primary',
        onClick: activeStep === steps.length - 1 ? handleConnect : handleNext,
        disabled: isSubmitting
      }, activeStep === steps.length - 1
        ? (isSubmitting ? 'Connecting...' : 'Connect')
        : 'Next')
    ])
  });
}