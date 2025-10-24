import React from 'react';
import { DropDownButtonComponent, ItemModel } from '@syncfusion/ej2-react-splitbuttons';
import { invoke } from '@tauri-apps/api/tauri';
import type { SenderStatus } from '../types';

interface EmailActionDropdownProps {
  email: string;
  currentStatus?: SenderStatus;
  size?: 'small' | 'normal';
  showLabel?: boolean;
  showIcon?: boolean;
  onActionComplete?: () => void;
}

export const EmailActionDropdown: React.FC<EmailActionDropdownProps> = ({ 
  email, 
  currentStatus = 'neutral',
  size = 'small',
  showLabel = true,
  showIcon = true,
  onActionComplete 
}) => {
  // Get status display info
  const getStatusInfo = () => {
    switch (currentStatus) {
      case 'allowed':
        return { icon: '✓', color: '#10b981', label: 'Allowed' };
      case 'blocked':
        return { icon: '✕', color: '#ef4444', label: 'Blocked' };
      default:
        return { icon: '○', color: '#6b7280', label: 'Neutral' };
    }
  };

  const statusInfo = getStatusInfo();

  // Handle status change
  const handleStatusChange = async (newStatus: SenderStatus) => {
    try {
      await invoke('set_sender_status', {
        senderEmail: email,
        status: newStatus
      });
      
      if (onActionComplete) {
        onActionComplete();
      }
    } catch (error) {
      console.error('Failed to change sender status:', error);
    }
  };

  // Define menu items
  const items: ItemModel[] = [
    { 
      text: '✓ Allow Sender', 
      id: 'allowed',
      disabled: currentStatus === 'allowed'
    },
    { 
      text: '○ Mark Neutral', 
      id: 'neutral',
      disabled: currentStatus === 'neutral'
    },
    { separator: true },
    { 
      text: '✕ Block Sender', 
      id: 'blocked',
      disabled: currentStatus === 'blocked'
    }
  ];

  // Button content
  const buttonContent = showIcon || showLabel ? `${showIcon ? statusInfo.icon : ''} ${showLabel ? statusInfo.label : ''}`.trim() : '⋮';

  return (
    <DropDownButtonComponent
      items={items}
      cssClass={`email-action-dropdown ${size === 'small' ? 'e-small' : ''} ${currentStatus === 'blocked' ? 'e-danger' : currentStatus === 'allowed' ? 'e-success' : 'e-outline'}`}
      content={buttonContent}
      select={(args: any) => {
        if (args.item.id) {
          void handleStatusChange(args.item.id as SenderStatus);
        }
      }}
    />
  );
};
