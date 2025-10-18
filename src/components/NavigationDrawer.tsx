import React from 'react';
import { createElement } from 'react';
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
      icon: '📬',
      disabled: !selectedAccount,
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
      id: 'settings',
      label: 'Settings',
      icon: '🔧',
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
      ] : accounts.map(account =>
        createElement('li', {
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
              backgroundColor: selectedAccount === account.email ? '#eff6ff' : 'transparent',
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
              }, account.email)
            ]),
            selectedAccount === account.email && createElement('span', {
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
        ])
      ))
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
              backgroundColor: currentView === item.id ? '#eff6ff' : 'transparent',
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