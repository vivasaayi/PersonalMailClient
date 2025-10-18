import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import type { SavedAccount } from '../types';

interface SavedAccountsDialogProps {
  open: boolean;
  onClose: () => void;
  savedAccounts: SavedAccount[];
  onConnectSaved: (saved: SavedAccount) => Promise<void>;
  connectingSavedEmail: string | null;
  onOpenConnectionWizard?: () => void;
}

const providerLabels: Record<SavedAccount['provider'], string> = {
  gmail: 'Gmail',
  outlook: 'Outlook / Live',
  yahoo: 'Yahoo Mail',
  custom: 'Custom IMAP'
};

export default function SavedAccountsDialog({
  open,
  onClose,
  savedAccounts,
  onConnectSaved,
  connectingSavedEmail,
  onOpenConnectionWizard
}: SavedAccountsDialogProps) {
  const handleSelect = async (saved: SavedAccount) => {
    try {
      await onConnectSaved(saved);
      onClose();
    } catch (error) {
      console.error('Failed to connect saved account', error);
    }
  };

  return (
    <DialogComponent
      isModal={true}
      visible={open}
      width="480px"
      height="auto"
      showCloseIcon={true}
      closeOnEscape={true}
      close={onClose}
      header="Saved Accounts"
      content={() => (
        <div style={{ padding: '16px', maxHeight: '60vh', overflowY: 'auto' }}>
          {savedAccounts.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6b7280', lineHeight: 1.5 }}>
              <p style={{ marginBottom: '12px' }}>No saved accounts yet.</p>
              <p style={{ margin: 0 }}>Connect a new account to see it listed here for quick access.</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {savedAccounts.map((saved) => (
                <li key={saved.email}>
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      padding: '16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      cursor: connectingSavedEmail === saved.email ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                      boxShadow: connectingSavedEmail === saved.email ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : '0 1px 3px rgba(15, 23, 42, 0.08)',
                      opacity: connectingSavedEmail === saved.email ? 0.7 : 1
                    }}
                    onClick={() => handleSelect(saved)}
                    disabled={connectingSavedEmail === saved.email}
                  >
                    <span style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '20px',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px'
                    }}>
                      {saved.email.charAt(0).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>{saved.email}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {providerLabels[saved.provider]} · {saved.has_password ? 'Keychain password available' : 'Password required'}
                      </div>
                      {saved.provider === 'custom' && saved.custom_host && (
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                          {saved.custom_host}:{saved.custom_port ?? '993'}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', color: '#1d4ed8' }}>
                      {connectingSavedEmail === saved.email ? 'Connecting…' : 'Connect'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      footerTemplate={() => (
        <div style={{
          display: 'flex',
          justifyContent: onOpenConnectionWizard ? 'space-between' : 'flex-end',
          alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          {onOpenConnectionWizard && (
            <ButtonComponent
              cssClass="e-outline"
              onClick={() => {
                onClose();
                onOpenConnectionWizard();
              }}
            >
              + Connect Account
            </ButtonComponent>
          )}
          <ButtonComponent cssClass="e-primary" onClick={onClose}>
            Close
          </ButtonComponent>
        </div>
      )}
    />
  );
}
