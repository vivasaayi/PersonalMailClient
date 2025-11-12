import { useState, useEffect, useCallback, useRef } from "react";
import { Button as BootstrapButton, Form } from "react-bootstrap";
import dayjs from "dayjs";

interface Message {
  uid: string;
  subject?: string;
  date?: string | null;
  snippet?: string | null;
  analysis_summary?: string | null;
}

interface VirtualizedMessageListProps {
  messages: Message[];
  selectedMessageUids: Set<string>;
  deletingUids: Set<string>;
  previewUid: string | null;
  isBusy: boolean;
  isDeleting: boolean;
  onToggleMessage: (uid: string) => void;
  onPeekMessage: (uid: string) => void;
  onDeleteSingle: (uid: string) => void;
  containerHeight?: number;
  itemHeight?: number;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value; // Return original invalid value for debugging
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

const ITEM_HEIGHT = 80; // Approximate height of each message item
const CONTAINER_HEIGHT = 400; // Default container height
const OVERSCAN = 5; // Number of items to render outside visible area

export function VirtualizedMessageList({
  messages,
  selectedMessageUids,
  deletingUids,
  previewUid,
  isBusy,
  isDeleting,
  onToggleMessage,
  onPeekMessage,
  onDeleteSingle,
  containerHeight = CONTAINER_HEIGHT,
  itemHeight = ITEM_HEIGHT,
}: VirtualizedMessageListProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRange = {
    start: Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN),
    end: Math.min(
      messages.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + OVERSCAN
    ),
  };

  const visibleItems = messages.slice(visibleRange.start, visibleRange.end + 1);
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

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

  // Reset scroll position when messages change significantly
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      className="sender-message-list virtualized"
      style={{ height: containerHeight, overflow: "auto" }}
      onScroll={handleScroll}
    >
      <div style={{ height: messages.length * itemHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((message, index) => {
            const actualIndex = visibleRange.start + index;
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
                style={{ height: itemHeight }}
              >
                <Form.Check
                  type="checkbox"
                  checked={isSelected}
                  disabled={rowDisabled}
                  onChange={() => onToggleMessage(message.uid)}
                  className="sender-message-checkbox"
                />
                <div
                  className="sender-message-content"
                  onClick={() => handleMessageClick(message.uid)}
                  role="button"
                  tabIndex={rowDisabled ? -1 : 0}
                  aria-disabled={rowDisabled}
                  onKeyDown={(event) => handleKeyDown(event, message.uid)}
                >
                  <div className="sender-message-header">
                    <div className="sender-message-subject">{message.subject || "(No subject)"}</div>
                    <div className="sender-message-date">{formatDate(message.date) || "—"}</div>
                  </div>
                  <div className="sender-message-meta">UID: {message.uid}</div>
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
                  >
                    {isPreviewed ? "Viewing" : "Peek"}
                  </BootstrapButton>
                  <BootstrapButton
                    size="sm"
                    variant="outline-danger"
                    onClick={() => onDeleteSingle(message.uid)}
                    disabled={rowDisabled}
                  >
                    {isDeletingThisRow ? "Deleting…" : "Delete"}
                  </BootstrapButton>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}