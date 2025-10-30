import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type { DeletedEmail } from "../types";

interface DeletedEmailsViewProps {
  accountEmail: string;
  emails: DeletedEmail[];
  onRestore: (uid: string) => Promise<void>;
  onPurge: (uid: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const formatDisplayDate = (value?: string | null) => {
  if (!value) return "Unknown";
  const parsed = dayjs(value);
  if (!parsed.isValid()) return value;
  return parsed.format("MMM D, YYYY h:mm A");
};

const formatTimestamp = (value?: number | null) => {
  if (!value) return null;
  const parsed = dayjs.unix(value);
  if (!parsed.isValid()) return null;
  return parsed.format("MMM D, YYYY h:mm A");
};

export default function DeletedEmailsView({
  accountEmail,
  emails,
  onRestore,
  onPurge,
  onRefresh
}: DeletedEmailsViewProps) {
  const [restoringUid, setRestoringUid] = useState<string | null>(null);
  const [purgingUid, setPurgingUid] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sortedEmails = useMemo(() => {
    return [...emails].sort((a, b) => b.deleted_at - a.deleted_at);
  }, [emails]);

  const handleRefreshClick = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleRestore = useCallback(
    async (uid: string) => {
      setRestoringUid(uid);
      try {
        await onRestore(uid);
      } finally {
        setRestoringUid((current) => (current === uid ? null : current));
      }
    },
    [onRestore]
  );

  const handlePurge = useCallback(
    async (uid: string) => {
      setPurgingUid(uid);
      try {
        await onPurge(uid);
      } finally {
        setPurgingUid((current) => (current === uid ? null : current));
      }
    },
    [onPurge]
  );

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        height: "100%",
        overflow: "auto"
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Deleted Messages</h2>
          <p style={{ margin: "4px 0 0", color: "#6b7280" }}>
            Local archive for {accountEmail}
          </p>
        </div>
        <ButtonComponent
          cssClass={refreshing ? "e-disabled" : "outlined"}
          content={refreshing ? "Refreshing…" : "Refresh"}
          disabled={refreshing}
          onClick={handleRefreshClick}
        />
      </header>

      {sortedEmails.length === 0 ? (
        <div
          style={{
            marginTop: "48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            color: "#6b7280"
          }}
        >
          <div style={{ fontSize: "48px" }}>🗂️</div>
          <div style={{ fontSize: "18px", fontWeight: 600 }}>Archive is empty</div>
          <div style={{ maxWidth: "360px", textAlign: "center", lineHeight: 1.5 }}>
            Deleted messages will appear here after you remove them from the main mailbox. They remain encrypted locally until you purge them.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}
        >
          {sortedEmails.map((email) => {
            const deletedAt = dayjs.unix(email.deleted_at).format("MMM D, YYYY h:mm A");
            const remoteDeletedAt = formatTimestamp(email.remote_deleted_at);
            const preview = email.analysis_summary || email.snippet || "No preview available.";
            const statusLabel = email.remote_error
              ? "Remote delete failed"
              : remoteDeletedAt
              ? `Removed remotely on ${remoteDeletedAt}`
              : "Pending remote delete";
            const statusColor = email.remote_error
              ? "#b91c1c"
              : remoteDeletedAt
              ? "#047857"
              : "#92400e";

            return (
              <div
                key={email.uid}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "4px" }}>
                      {email.subject || "(No subject)"}
                    </div>
                    <div style={{ color: "#4b5563", fontSize: "0.875rem" }}>
                      {email.sender_display || email.sender_email} • {formatDisplayDate(email.date)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: statusColor,
                      border: `1px solid ${statusColor}`
                    }}
                  >
                    {statusLabel}
                  </div>
                </div>

                <div style={{ color: "#374151", fontSize: "0.9rem", lineHeight: 1.5 }}>{preview}</div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                    Deleted locally on {deletedAt}
                    {email.remote_error && (
                      <span style={{ marginLeft: "8px", color: "#b91c1c" }}>
                        Error: {email.remote_error}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <ButtonComponent
                      cssClass="primary"
                      content={restoringUid === email.uid ? "Restoring…" : "Restore"}
                      disabled={restoringUid === email.uid || purgingUid === email.uid}
                      onClick={() => handleRestore(email.uid)}
                    />
                    <ButtonComponent
                      cssClass="outlined"
                      content={purgingUid === email.uid ? "Removing…" : "Purge"}
                      disabled={purgingUid === email.uid || restoringUid === email.uid}
                      style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                      onClick={() => handlePurge(email.uid)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
