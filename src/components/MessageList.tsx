import { useCallback } from "react";
import { Button as BootstrapButton, Form } from "react-bootstrap";
import dayjs from "dayjs";

interface Message {
  uid: string;
  subject?: string;
  date?: string | null;
  snippet?: string | null;
  analysis_summary?: string | null;
}

interface MessageListProps {
  messages: Message[];
  selectedMessageUids: Set<string>;
  deletingUids: Set<string>;
  previewUid: string | null;
  isBusy: boolean;
  isDeleting: boolean;
  onToggleMessage: (uid: string) => void;
  onPeekMessage: (uid: string) => void;
  onDeleteSingle: (uid: string) => void;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value; // Return original invalid value for debugging
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

export function MessageList({
  messages,
  selectedMessageUids,
  deletingUids,
  previewUid,
  isBusy,
  isDeleting,
  onToggleMessage,
  onPeekMessage,
  onDeleteSingle
}: MessageListProps) {
  const handleMessageClick = useCallback((uid: string) => {
    if (isBusy) return;
    onPeekMessage(uid);
  }, [isBusy, onPeekMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, uid: string) => {
    if (isBusy) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPeekMessage(uid);
    }
  }, [isBusy, onPeekMessage]);

  return (
    <div 
      className="sender-message-list"
      role="list"
      aria-label="Messages from sender"
    >
      {messages.map((message) => {
        const isSelected = selectedMessageUids.has(message.uid);
        const isPreviewed = previewUid === message.uid;
        const isDeletingThisRow = deletingUids.has(message.uid) || isDeleting;
        const rowDisabled = isBusy;

        return (
          <div
            key={message.uid}
            className={`sender-message-item${isSelected ? " is-selected" : ""}${
              isPreviewed ? " is-previewed" : ""
            }`}
            role="listitem"
            aria-selected={isSelected}
            aria-current={isPreviewed ? "true" : undefined}
          >
            <Form.Check
              type="checkbox"
              checked={isSelected}
              disabled={rowDisabled}
              onChange={() => onToggleMessage(message.uid)}
              className="sender-message-checkbox"
              aria-label={`Select message: ${message.subject || "No subject"}`}
            />
            <div
              className="sender-message-content"
              onClick={() => handleMessageClick(message.uid)}
              role="button"
              tabIndex={rowDisabled ? -1 : 0}
              aria-disabled={rowDisabled}
              aria-label={`View message details: ${message.subject || "No subject"}`}
              onKeyDown={(event) => handleKeyDown(event, message.uid)}
            >
              <div className="sender-message-header">
                <div className="sender-message-subject">{message.subject || "(No subject)"}</div>
                <div className="sender-message-date" aria-label={`Sent ${formatDate(message.date) || "unknown date"}`}>
                  {formatDate(message.date) || "—"}
                </div>
              </div>
              <div className="sender-message-meta" aria-label={`Message UID: ${message.uid}`}>UID: {message.uid}</div>
              <div className="sender-message-snippet">
                {message.analysis_summary || message.snippet || "No summary captured for this message."}
              </div>
            </div>
            <div className="sender-message-actions">
              <BootstrapButton
                size="sm"
                variant={isPreviewed ? "primary" : "outline-primary"}
                onClick={() => onPeekMessage(message.uid)}
                disabled={rowDisabled}
                aria-label={isPreviewed ? "Currently viewing this message" : "View message details"}
              >
                {isPreviewed ? "Viewing" : "Peek"}
              </BootstrapButton>
              <BootstrapButton
                size="sm"
                variant="outline-danger"
                onClick={() => onDeleteSingle(message.uid)}
                disabled={rowDisabled}
                aria-label={`Delete message: ${message.subject || "No subject"}`}
              >
                {isDeletingThisRow ? "Deleting…" : "Delete"}
              </BootstrapButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}