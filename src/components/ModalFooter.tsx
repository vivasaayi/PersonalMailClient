import { Button as BootstrapButton } from "react-bootstrap";

interface ModalFooterProps {
  visibleMessages: number;
  softDeletedCount: number;
  totalMessages: number;
  selectedCount: number;
  isBusy: boolean;
  isDeleting: boolean;
  isPurging: boolean;
  hasSender: boolean;
  onClose: () => void;
  onPurgeAll: () => void;
  onDeleteSelected: () => void;
}

export function ModalFooter({
  visibleMessages,
  softDeletedCount,
  totalMessages,
  selectedCount,
  isBusy,
  isDeleting,
  isPurging,
  hasSender,
  onClose,
  onPurgeAll,
  onDeleteSelected
}: ModalFooterProps) {
  const getDeleteButtonText = () => {
    if (selectedCount <= 1) return "Delete message";
    return `Delete ${selectedCount} messages`;
  };

  return (
    <div className="sender-messages-modal-footer">
      <div 
        className="sender-messages-footer-meta"
        aria-live="polite"
        aria-atomic="true"
      >
        {visibleMessages} visible message{visibleMessages === 1 ? "" : "s"}
        {softDeletedCount > 0 && (
          <span className="sender-messages-soft-deleted" aria-label={`${softDeletedCount} messages queued for deletion`}>
            ({softDeletedCount} queued for deletion)
          </span>
        )}
        {totalMessages > visibleMessages && (
          <span className="sender-messages-total" aria-label={`of ${totalMessages} total messages`}>
            of {totalMessages} total
          </span>
        )}
      </div>
      <div className="sender-messages-footer-actions" role="group" aria-label="Message actions">
        <BootstrapButton
          variant="outline-secondary"
          onClick={onClose}
          className="sender-messages-button"
          aria-label="Close message modal"
        >
          Close
        </BootstrapButton>
        <BootstrapButton
          variant="outline-danger"
          onClick={onPurgeAll}
          disabled={!hasSender || totalMessages === 0}
          className="sender-messages-button"
          aria-label={`Purge all ${totalMessages} messages from this sender`}
        >
          Purge all messages
        </BootstrapButton>
        <BootstrapButton
          variant="danger"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
          className="sender-messages-button"
          aria-label={selectedCount === 0 ? "No messages selected" : `Delete ${selectedCount} selected message${selectedCount === 1 ? "" : "s"}`}
        >
          {getDeleteButtonText()}
        </BootstrapButton>
      </div>
    </div>
  );
}