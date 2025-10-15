import { clsx } from "clsx";
import type { SenderStatus } from "../types";

const statusLabel = (status: SenderStatus) => {
  switch (status) {
    case "allowed":
      return "Allowed";
    case "blocked":
      return "Blocked";
    default:
      return "Neutral";
  }
};

// Custom cell renderer for status buttons
export const StatusButtonRenderer = (props: any) => {
  const { data, onStatusChange, statusUpdating } = props;
  const statuses: SenderStatus[] = ["allowed", "neutral", "blocked"];
  const isUpdating = statusUpdating === data.sender_email;

  return (
    <div className="status-actions" style={{
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          className={clsx("status-button", status, {
            active: data.status === status
          })}
          onClick={() => onStatusChange(data.sender_email, status)}
          disabled={isUpdating || data.status === status}
          style={{
            padding: '4px 8px',
            border: data.status === status ? '2px solid #007bff' : '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: data.status === status ? '#e3f2fd' : 'white',
            color: data.status === status ? '#007bff' : '#333',
            cursor: (isUpdating || data.status === status) ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            textTransform: 'capitalize',
            opacity: isUpdating ? 0.6 : 1,
            minWidth: '60px'
          }}
        >
          {isUpdating ? "..." : statusLabel(status)}
        </button>
      ))}
    </div>
  );
};

// Custom cell renderer for sender info
export const SenderInfoRenderer = (props: any) => {
  const { data, onToggleExpansion, expandedSender } = props;
  const isExpanded = expandedSender === data.sender_email;

  return (
    <button
      type="button"
      className="sender-header"
      onClick={() => onToggleExpansion(data.sender_email)}
      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '8px' }}
    >
      <div className="sender-ident">
        <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>{data.sender_display}</h3>
        <span className="sender-email" style={{ fontSize: '12px', color: '#666' }}>{data.sender_email}</span>
      </div>
      <div className="sender-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
        <span className={clsx("status-pill", data.status)} style={{
          padding: '2px 6px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: '500',
          textTransform: 'capitalize'
        }}>
          {statusLabel(data.status)}
        </span>
        <span className="sender-count" style={{ fontSize: '12px', color: '#666' }}>
          {data.message_count} message{data.message_count === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: '12px', color: '#666' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>
    </button>
  );
};