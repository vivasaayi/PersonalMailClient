import { Dropdown, Form } from "react-bootstrap";

type SortOrder = "newest" | "oldest";

interface MessageToolbarProps {
  allMessagesSelected: boolean;
  selectedCount: number;
  sortOrder: SortOrder;
  isBusy: boolean;
  totalMessages: number;
  onToggleAll: () => void;
  onSortOrderChange: (order: SortOrder) => void;
}

export function MessageToolbar({
  allMessagesSelected,
  selectedCount,
  sortOrder,
  isBusy,
  totalMessages,
  onToggleAll,
  onSortOrderChange
}: MessageToolbarProps) {
  const getSelectionText = () => {
    if (selectedCount === 0) return "No messages selected";
    if (selectedCount === 1) return "1 message selected";
    return `${selectedCount} messages selected`;
  };

  return (
    <div className="sender-messages-toolbar" role="toolbar" aria-label="Message actions toolbar">
      <Form.Check
        type="checkbox"
        id="sender-messages-select-all"
        label="Select all"
        className="sender-messages-select-all"
        checked={allMessagesSelected && totalMessages > 0}
        disabled={isBusy || totalMessages === 0}
        onChange={onToggleAll}
        aria-describedby="selection-count"
      />
      <div className="sender-messages-sort-controls">
        <span className="sender-messages-sort-label" id="sort-label">Sort by date:</span>
        <Dropdown aria-labelledby="sort-label">
          <Dropdown.Toggle 
            variant="outline-secondary" 
            size="sm" 
            disabled={isBusy}
            aria-label={`Sort messages ${sortOrder === "newest" ? "newest first" : "oldest first"}`}
          >
            {sortOrder === "newest" ? "Newest first" : "Oldest first"}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item
              active={sortOrder === "newest"}
              onClick={() => onSortOrderChange("newest")}
              disabled={isBusy}
              aria-label="Sort by newest first"
            >
              Newest first
            </Dropdown.Item>
            <Dropdown.Item
              active={sortOrder === "oldest"}
              onClick={() => onSortOrderChange("oldest")}
              disabled={isBusy}
              aria-label="Sort by oldest first"
            >
              Oldest first
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
      <span 
        className="sender-messages-selection-count" 
        id="selection-count"
        aria-live="polite"
        aria-atomic="true"
      >
        {getSelectionText()}
      </span>
    </div>
  );
}