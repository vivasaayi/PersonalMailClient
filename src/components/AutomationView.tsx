import React from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { createElement } from 'react';
import type { SyncReport } from '../types';

interface AutomationViewProps {
  periodicMinutes: number;
  onPeriodicMinutesChange: (value: number) => void;
  onSavePeriodicSync: () => Promise<void>;
  isSavingPeriodic: boolean;
  blockFolder: string;
  onBlockFolderChange: (value: string) => void;
  onApplyBlockFilter: () => Promise<void>;
  isApplyingBlockFilter: boolean;
  syncReport: SyncReport | null;
  onFullSync: () => Promise<void>;
  isSyncing: boolean;
}

export default function AutomationView({
  periodicMinutes,
  onPeriodicMinutesChange,
  onSavePeriodicSync,
  isSavingPeriodic,
  blockFolder,
  onBlockFolderChange,
  onApplyBlockFilter,
  isApplyingBlockFilter,
  syncReport,
  onFullSync,
  isSyncing
}: AutomationViewProps) {
  return createElement('div', {
    style: { padding: '24px', maxWidth: '800px', margin: '0 auto' }
  }, [
    createElement('h1', {
      key: 'title',
      style: { fontSize: '2.125rem', marginBottom: '16px' }
    }, 'Automation Settings'),
    createElement('p', {
      key: 'subtitle',
      style: { color: '#6b7280', marginBottom: '32px', fontSize: '1rem' }
    }, 'Configure automatic email processing and synchronization for this account.'),

    // Periodic Sync Card
    createElement('div', {
      key: 'periodic-sync-card',
      style: {
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        marginBottom: '24px'
      }
    }, [
      createElement('div', { key: 'periodic-content', style: { padding: '16px' } }, [
        createElement('div', {
          key: 'periodic-header',
          style: { display: 'flex', alignItems: 'center', marginBottom: '16px' }
        }, [
          createElement('span', { key: 'schedule-icon', style: { marginRight: '8px', color: '#3b82f6' } }, '⏰'),
          createElement('h2', {
            key: 'periodic-title',
            style: { fontSize: '1.25rem', fontWeight: '500', margin: 0 }
          }, 'Periodic Sync')
        ]),
        createElement('p', {
          key: 'periodic-desc',
          style: { color: '#6b7280', marginBottom: '24px', fontSize: '0.875rem' }
        }, 'Keep this mailbox fresh by syncing on a schedule.'),

        createElement('div', {
          key: 'periodic-controls',
          style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }
        }, [
          createElement('div', { key: 'interval-group', style: { minWidth: '200px' } }, [
            createElement('label', {
              key: 'interval-label',
              style: {
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '4px',
                color: '#374151'
              }
            }, 'Interval'),
            createElement('select', {
              key: 'interval-select',
              value: periodicMinutes,
              onChange: (event: any) => onPeriodicMinutesChange(Number(event.target.value) || 0),
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }
            }, [
              createElement('option', { key: 'disabled', value: 0 }, 'Disabled'),
              createElement('option', { key: '5min', value: 5 }, '5 minutes'),
              createElement('option', { key: '15min', value: 15 }, '15 minutes'),
              createElement('option', { key: '30min', value: 30 }, '30 minutes'),
              createElement('option', { key: '1hour', value: 60 }, '1 hour'),
              createElement('option', { key: '2hours', value: 120 }, '2 hours'),
              createElement('option', { key: '4hours', value: 240 }, '4 hours'),
              createElement('option', { key: '8hours', value: 480 }, '8 hours'),
              createElement('option', { key: '24hours', value: 1440 }, '24 hours')
            ])
          ]),

          createElement(ButtonComponent, {
            key: 'save-periodic',
            cssClass: `primary ${isSavingPeriodic ? 'disabled' : ''}`,
            content: isSavingPeriodic ? 'Saving…' : (periodicMinutes > 0 ? 'Enable' : 'Disable'),
            disabled: isSavingPeriodic,
            onClick: onSavePeriodicSync
          })
        ]),

        createElement('p', {
          key: 'periodic-help',
          style: { color: '#6b7280', fontSize: '0.75rem', margin: 0 }
        }, 'Set to "Disabled" to turn off periodic syncing.')
      ])
    ]),

    // Block Filter Card
    createElement('div', {
      key: 'block-filter-card',
      style: {
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        marginBottom: '24px'
      }
    }, [
      createElement('div', { key: 'block-content', style: { padding: '16px' } }, [
        createElement('div', {
          key: 'block-header',
          style: { display: 'flex', alignItems: 'center', marginBottom: '16px' }
        }, [
          createElement('span', { key: 'block-icon', style: { marginRight: '8px', color: '#dc2626' } }, '🚫'),
          createElement('h2', {
            key: 'block-title',
            style: { fontSize: '1.25rem', fontWeight: '500', margin: 0 }
          }, 'Blocked Sender Filter')
        ]),
        createElement('p', {
          key: 'block-desc',
          style: { color: '#6b7280', marginBottom: '24px', fontSize: '0.875rem' }
        }, 'Move messages from blocked senders to a safer folder.'),

        createElement('div', {
          key: 'block-controls',
          style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }
        }, [
          createElement('div', { key: 'folder-input', style: { minWidth: '200px' } }, [
            createElement('label', {
              key: 'folder-label',
              style: {
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '4px',
                color: '#374151'
              }
            }, 'Target Folder'),
            createElement('input', {
              key: 'folder-textbox',
              type: 'text',
              value: blockFolder,
              onChange: (event: any) => onBlockFolderChange(event.target.value),
              placeholder: 'Blocked',
              style: {
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }
            })
          ]),

          createElement(ButtonComponent, {
            key: 'apply-filter',
            cssClass: `error ${isApplyingBlockFilter ? 'disabled' : ''}`,
            content: isApplyingBlockFilter ? 'Applying…' : 'Apply Filter',
            disabled: isApplyingBlockFilter,
            onClick: onApplyBlockFilter
          })
        ]),

        createElement('p', {
          key: 'block-help',
          style: { color: '#6b7280', fontSize: '0.75rem', margin: 0 }
        }, 'Leave blank to use the provider default "Blocked" folder.')
      ])
    ]),

    // Last Sync Report Card
    createElement('div', {
      key: 'sync-report-card',
      style: {
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }
    }, [
      createElement('div', { key: 'sync-content', style: { padding: '16px' } }, [
        createElement('div', {
          key: 'sync-header',
          style: { display: 'flex', alignItems: 'center', marginBottom: '16px' }
        }, [
          createElement('span', { key: 'sync-icon', style: { marginRight: '8px', color: '#16a34a' } }, '▶️'),
          createElement('h2', {
            key: 'sync-title',
            style: { fontSize: '1.25rem', fontWeight: '500', margin: 0 }
          }, 'Last Full Sync')
        ]),

        syncReport ? createElement('div', { key: 'sync-stats', style: { marginBottom: '24px' } }, [
          createElement('div', {
            key: 'stats-chips',
            style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }
          }, [
            createElement('span', {
              key: 'fetched-chip',
              style: {
                padding: '4px 8px',
                border: '1px solid #0ea5e9',
                borderRadius: '4px',
                fontSize: '0.875rem',
                backgroundColor: '#f0f9ff',
                color: '#0c4a6e'
              }
            }, `Fetched: ${syncReport.fetched.toLocaleString()}`),
            createElement('span', {
              key: 'stored-chip',
              style: {
                padding: '4px 8px',
                border: '1px solid #16a34a',
                borderRadius: '4px',
                fontSize: '0.875rem',
                backgroundColor: '#f0fdf4',
                color: '#14532d'
              }
            }, `Stored: ${syncReport.stored.toLocaleString()}`),
            createElement('span', {
              key: 'duration-chip',
              style: {
                padding: '4px 8px',
                border: '1px solid #d97706',
                borderRadius: '4px',
                fontSize: '0.875rem',
                backgroundColor: '#fffbeb',
                color: '#92400e'
              }
            }, `Duration: ${(syncReport.duration_ms / 1000).toFixed(1)}s`)
          ])
        ]) : createElement('p', {
          key: 'no-sync',
          style: { color: '#6b7280', marginBottom: '24px', fontSize: '0.875rem' }
        }, 'No full sync run in this session yet.'),

        createElement(ButtonComponent, {
          key: 'run-sync',
          cssClass: `outlined ${isSyncing ? 'disabled' : ''}`,
          content: isSyncing ? 'Syncing…' : 'Run Full Sync',
          disabled: isSyncing,
          onClick: onFullSync
        })
      ])
    ])
  ]);
}