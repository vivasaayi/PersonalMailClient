import { createElement } from 'react';
import type { Account } from '../types';
import type { AccountLifecycleStatus, AccountRuntimeState } from '../stores/accountsStore';

const DRAWER_WIDTH = 280;

interface NavigationDrawerProps {
  open: boolean;
  accounts: Account[];
  runtimeByEmail: Record<string, AccountRuntimeState>;
  selectedAccount: string | null;
  onAccountSelect: (email: string | null) => void;
  onNavigate: (view: string) => void;
  currentView: string;
  onOpenSavedAccounts: () => void;
  hasSavedAccounts: boolean;
}

const STATUS_META: Record<AccountLifecycleStatus, { label: string; color: string }> = {
  idle: { label: 'Idle', color: '#047857' },
  connecting: { label: 'Connecting…', color: '#1d4ed8' },
  syncing: { label: 'Syncing…', color: '#4338ca' },
  error: { label: 'Needs attention', color: '#b91c1c' }
};

export default function NavigationDrawer({
  open,
  accounts,
  runtimeByEmail,
  selectedAccount,
  onAccountSelect,
  onNavigate,
  currentView,
  onOpenSavedAccounts,
  hasSavedAccounts
}: NavigationDrawerProps) {
  const menuItems = [
    {
      id: 'webmail',
      label: 'Webmail',
      icon: '📧',
      disabled: !selectedAccount,
    },
    {
      id: 'pivot',
      label: 'Pivot View',
      icon: '�',
      disabled: !selectedAccount,
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: '👥',
      disabled: false,
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: '⚙️',
      disabled: !selectedAccount,
    },
    {
      id: 'sync',
      label: 'Sync Settings',
      icon: '🔄',
      disabled: !selectedAccount,
    },
    {
      id: 'blocked',
      label: 'Blocked Senders',
      icon: '🚫',
      disabled: !selectedAccount,
    },
    {
      id: 'blocked-domains',
      label: 'Blocked Domains',
      icon: '🏢',
      disabled: !selectedAccount,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '🔧',
      disabled: false,
    },
    {
      id: 'assistant',
      label: 'AI Assistant',
      icon: '🤖',
      disabled: false,
    },
  ];

  return createElement('div', {
    style: {
      width: open ? DRAWER_WIDTH : 0,
      height: '100%',
      backgroundColor: '#ffffff',
      borderRight: '1px solid #e5e7eb',
      overflow: 'hidden',
      transition: 'width 0.2s ease-in-out'
    }
  }, [
    // Header
    createElement('div', {
      key: 'header',
      style: {
        padding: '16px',
        borderBottom: '1px solid #e5e7eb'
      }
    }, [
      createElement('h1', {
        key: 'title',
        style: {
          fontSize: '1.25rem',
          fontWeight: 'bold',
          margin: '0 0 4px 0'
        }
      }, 'Personal Mail Client'),
      createElement('p', {
        key: 'subtitle',
        style: {
          fontSize: '0.75rem',
          color: '#6b7280',
          margin: 0
        }
      }, 'Enterprise Email Management')
    ]),

    // Accounts Section
    createElement('div', { key: 'accounts-section', style: { padding: '16px' } }, [
      createElement('h3', {
        key: 'accounts-title',
        style: {
          fontSize: '0.875rem',
          fontWeight: '500',
          margin: '0 0 8px 0'
        }
      }, 'Connected Accounts'),
      createElement('ul', {
        key: 'accounts-list',
        style: { listStyle: 'none', padding: 0, margin: 0 }
      }, accounts.length === 0 ? [
        createElement('li', { key: 'no-accounts', style: { padding: '8px 0' } }, [
          createElement('span', {
            key: 'no-accounts-text',
            style: { fontSize: '0.875rem', color: '#6b7280' }
          }, 'No accounts connected')
        ])
      ] : accounts.map(account => {
        const normalizedEmail = account.email.trim().toLowerCase();
        const runtime = runtimeByEmail[normalizedEmail];
        const status = runtime?.status ?? 'idle';
        const statusMeta = STATUS_META[status];
        const isActive = selectedAccount === account.email;

        return createElement('li', {
          key: account.email,
          style: { marginBottom: '4px' }
        }, [
          createElement('button', {
            key: 'account-button',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: isActive ? '#eff6ff' : 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            },
            onClick: () => onAccountSelect(account.email)
          }, [
            createElement('div', {
              key: 'account-avatar',
              style: {
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '12px',
                marginRight: '12px'
              }
            }, '✉️'),
            createElement('div', { key: 'account-text', style: { flex: 1 } }, [
              createElement('div', {
                key: 'account-name',
                style: {
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }
              }, account.display_name || account.email),
              createElement('div', {
                key: 'account-email',
                style: {
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }
              }, account.email),
              createElement('div', {
                key: 'account-status',
                style: {
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  color: statusMeta.color
                }
              }, [
                createElement('span', {
                  key: 'status-dot',
                  style: {
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: statusMeta.color
                  }
                }),
                statusMeta.label
              ])
            ]),
            isActive && createElement('span', {
              key: 'active-chip',
              style: {
                padding: '2px 6px',
                border: '1px solid #3b82f6',
                borderRadius: '4px',
                fontSize: '0.7rem',
                backgroundColor: '#3b82f6',
                color: '#ffffff'
              }
            }, 'Active')
          ])
        ]);
      })),
      createElement('button', {
        key: 'saved-accounts-trigger',
        style: {
          width: '100%',
          marginTop: '12px',
          padding: '10px 12px',
          borderRadius: '6px',
          border: hasSavedAccounts ? '1px solid #2563eb' : '1px solid #d1d5db',
          backgroundColor: hasSavedAccounts ? '#2563eb' : '#f3f4f6',
          color: hasSavedAccounts ? '#ffffff' : '#1f2937',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background-color 0.2s ease, color 0.2s ease'
        },
        onClick: onOpenSavedAccounts,
        title: hasSavedAccounts ? 'Open saved accounts' : 'No saved accounts yet — connect one to quick-launch here'
      }, 'Saved Accounts')
    ]),

    // Divider
    createElement('hr', { key: 'divider1', style: { border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 } }),

    // Navigation Menu
    createElement('div', { key: 'nav-menu', style: { flex: 1 } }, [
      createElement('ul', {
        key: 'nav-list',
        style: { listStyle: 'none', padding: '8px 0', margin: 0 }
      }, menuItems.map(item =>
        createElement('li', { key: item.id, style: { marginBottom: '4px' } }, [
          createElement('button', {
            key: 'nav-button',
            style: {
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor:
                currentView === item.id
                  ? '#eff6ff'
                  : 'transparent',
              color: item.disabled ? '#9ca3af' : '#000000',
              textAlign: 'left',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center'
            },
            disabled: item.disabled,
            onClick: () => onNavigate(item.id)
          }, [
            createElement('span', {
              key: 'nav-icon',
              style: { marginRight: '12px', fontSize: '16px' }
            }, item.icon),
            createElement('span', {
              key: 'nav-label',
              style: { fontSize: '0.875rem' }
            }, item.label)
          ])
        ])
      ))
    ]),

    // Divider
    createElement('hr', { key: 'divider2', style: { border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 } }),

    // Footer
    createElement('div', { key: 'footer', style: { padding: '16px', textAlign: 'center' } }, [
      createElement('span', {
        key: 'version',
        style: { fontSize: '0.75rem', color: '#6b7280' }
      }, 'v1.0.0')
    ])
  ]);
}