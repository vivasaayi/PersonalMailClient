import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { createElement } from 'react';
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
  return createElement('div', {
    style: {
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: '#ffffff'
    }
  }, [
    createElement('div', { key: 'content', style: { padding: '16px' } }, [
      // Header
      createElement('div', {
        key: 'header',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
        }
      }, [
        createElement('span', { key: 'email-icon', style: { color: '#3b82f6' } }, '📧'),
        createElement('h2', {
          key: 'title',
          style: {
            fontSize: '1.25rem',
            fontWeight: '600',
            margin: 0
          }
        }, 'Connected Accounts')
      ]),

      // Content
      accounts.length === 0 ? createElement('p', {
        key: 'no-accounts',
        style: {
          color: '#6b7280',
          fontStyle: 'italic',
          margin: 0
        }
      }, 'No accounts connected yet.') : createElement('ul', {
        key: 'account-list',
        style: { listStyle: 'none', padding: 0, margin: 0 }
      }, accounts.map(account =>
        createElement('li', {
          key: account.email,
          style: {
            display: 'flex',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid #f3f4f6'
          }
        }, [
          // Account button
          createElement('button', {
            key: 'account-button',
            style: {
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: account.email === selectedAccount ? '#3b82f6' : 'transparent',
              color: account.email === selectedAccount ? '#ffffff' : '#000000',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start'
            },
            onClick: () => onSelectAccount(account.email)
          }, [
            // Primary content
            createElement('div', {
              key: 'primary',
              style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }
            }, [
              createElement('span', {
                key: 'provider-chip',
                style: {
                  padding: '2px 6px',
                  border: account.email === selectedAccount ? '1px solid #ffffff' : '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  backgroundColor: account.email === selectedAccount ? '#ffffff' : '#f9fafb',
                  color: account.email === selectedAccount ? '#3b82f6' : '#374151'
                }
              }, providerLabels[account.provider]),
              account.email === selectedAccount && createElement('span', { key: 'active-icon' }, '✓')
            ]),
            // Secondary content
            createElement('span', {
              key: 'email',
              style: {
                fontSize: '14px',
                color: account.email === selectedAccount ? '#ffffff' : '#6b7280'
              }
            }, account.email)
          ]),

          // Delete button
          createElement(ButtonComponent, {
            key: 'delete-button',
            cssClass: 'delete-button',
            content: removingAccount === account.email ? '...' : '🗑️',
            disabled: removingAccount === account.email,
            onClick: (event: any) => {
              event.stopPropagation();
              onDisconnect(account.email);
            }
          })
        ])
      ))
    ])
  ]);
}