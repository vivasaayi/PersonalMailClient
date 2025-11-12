import { useMemo, useCallback, useState } from "react";
import { Container, Row as BootstrapRow, Col } from "react-bootstrap";
import dayjs from "dayjs";
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Inject,
  Page,
  Sort,
  Filter,
  Resize,
  Selection
} from "@syncfusion/ej2-react-grids";
import type { SelectionSettingsModel } from "@syncfusion/ej2-react-grids";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { EmailActionDropdown } from "./EmailActionDropdown";
import { SenderMessagesModal } from "./SenderMessagesModal";
import type { SenderGroup, SenderStatus } from "../types";
import { validateEmail } from "../utils/validation";

type SenderEmailCellProps = {
  senderEmail: string;
  onOpenMessages: (email: string) => void;
};

const SenderEmailCell = ({ senderEmail, onOpenMessages }: SenderEmailCellProps) => (
  <button
    type="button"
    className="sender-email-link"
    onClick={() => onOpenMessages(senderEmail)}
    aria-label={`View messages from ${senderEmail}`}
  >
    {senderEmail}
  </button>
);

type StatusActionsCellProps = {
  senderEmail: string;
  status: SenderStatus;
  isUpdating: boolean;
  isPurging: boolean;
  onStatusChange: (email: string, status: SenderStatus) => Promise<void>;
  onPurge: (email: string) => void;
};

const StatusActionsCell = ({
  senderEmail,
  status,
  isUpdating,
  isPurging,
  onStatusChange,
  onPurge
}: StatusActionsCellProps) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "12px",
      width: "100%",
      minHeight: "40px" // Ensure consistent height
    }}
  >
    <div style={{ flex: 1 }}>
      <EmailActionDropdown
        email={senderEmail}
        currentStatus={status}
        size="small"
        showLabel
        showIcon
        isUpdating={isUpdating}
        onStatusChange={(nextStatus) => onStatusChange(senderEmail, nextStatus)}
      />
    </div>
    <div style={{ flexShrink: 0 }}>
      <ButtonComponent
        cssClass="ghost-button"
        content={isPurging ? "Purging…" : "Purge"}
        disabled={isPurging}
        onClick={() => onPurge(senderEmail)}
        style={{
          borderColor: "#fca5a5",
          color: "#f87171",
          minWidth: "80px" // Fixed width to prevent layout shift
        }}
      />
    </div>
  </div>
);

type SenderRow = {
  senderEmail: string;
  senderDisplay: string;
  status: SenderStatus;
  messageCount: number;
  latestDate?: string | null;
  latestFormatted: string;
  preview: string;
};

interface BlockedSendersViewProps {
  senderGroups: SenderGroup[];
  accountEmail: string;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onRefresh: () => Promise<void>;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  onPurgeSender: (senderEmail: string) => Promise<void>;
  hasSenderData: boolean;
}

const statusPalette: Record<SenderStatus, { label: string; bg: string; fg: string; border: string }> = {
  blocked: {
    label: "Blocked",
    bg: "rgba(252, 165, 165, 0.2)",
    fg: "#b91c1c",
    border: "#fca5a5"
  },
  allowed: {
    label: "Allowed",
    bg: "rgba(134, 239, 172, 0.25)",
    fg: "#15803d",
    border: "#86efac"
  },
  neutral: {
    label: "Neutral",
    bg: "rgba(209, 213, 219, 0.25)",
    fg: "#4b5563",
    border: "#d1d5db"
  }
};

const statusOrdering: Record<SenderStatus, number> = {
  blocked: 0,
  allowed: 1,
  neutral: 2
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

export default function BlockedSendersView({
  senderGroups,
  accountEmail,
  onStatusChange,
  statusUpdating,
  onRefresh,
  onDeleteMessage,
  onPurgeSender,
  hasSenderData
}: BlockedSendersViewProps) {
  const selectionSettings = useMemo<SelectionSettingsModel>(
    () => ({ mode: "Row", type: "Single" }),
    []
  );

  const counts = useMemo(() => {
    return senderGroups.reduce(
      (acc, group) => {
        acc[group.status] += 1;
        return acc;
      },
      { blocked: 0, allowed: 0, neutral: 0 } as Record<SenderStatus, number>
    );
  }, [senderGroups]);

  const [activeSenderEmail, setActiveSenderEmail] = useState<string | null>(null);
  const [purgingSender, setPurgingSender] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoize the processed sender groups with latest message calculation
  const processedSenderGroups = useMemo(() => {
    return senderGroups
      .filter((group) => validateEmail(group.sender_email))
      .map((group) => {
        const latestMessage = group.messages.reduce((latest, candidate) => {
          if (!candidate.date) return latest;
          if (!latest) return candidate;
          if (!latest.date) return candidate;
          return dayjs(candidate.date).isAfter(dayjs(latest.date)) ? candidate : latest;
        }, group.messages[0] ?? null);

        return {
          ...group,
          latestMessage,
          latestFormatted: formatDate(latestMessage?.date),
          preview: latestMessage?.analysis_summary ?? latestMessage?.snippet ?? ""
        };
      });
  }, [senderGroups]);

  const gridData = useMemo<SenderRow[]>(() => {
    return processedSenderGroups
      .map((group) => ({
        senderEmail: group.sender_email,
        senderDisplay: group.sender_display || group.sender_email,
        status: group.status,
        messageCount: group.message_count,
        latestDate: group.latestMessage?.date,
        latestFormatted: group.latestFormatted,
        preview: group.preview
      } satisfies SenderRow))
      .sort((a, b) => {
        const byStatus = statusOrdering[a.status] - statusOrdering[b.status];
        if (byStatus !== 0) return byStatus;
        return a.senderEmail.localeCompare(b.senderEmail, undefined, { sensitivity: "base" });
      });
  }, [processedSenderGroups]);

  const activeSender = useMemo(() => {
    if (!activeSenderEmail) {
      return null;
    }
    return senderGroups.find((group) => group.sender_email === activeSenderEmail) ?? null;
  }, [activeSenderEmail, senderGroups]);

  const handleOpenSenderMessages = useCallback((senderEmail: string) => {
    const trimmed = senderEmail.trim();
    if (!trimmed || !validateEmail(trimmed)) {
      setError("Invalid email address provided for opening sender messages");
      return;
    }
    setError(null); // Clear any previous errors
    setActiveSenderEmail(trimmed);
  }, []);

  const handleCloseMessagesModal = useCallback(() => {
    setActiveSenderEmail(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setError(null); // Clear any previous errors
      await onRefresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to refresh data";
      setError(`Refresh failed: ${errorMessage}`);
      console.error("Failed to refresh sender data", err);
    }
  }, [onRefresh]);

  const emailTemplate = useCallback(
    (props: SenderRow) => (
      <SenderEmailCell
        senderEmail={props.senderEmail}
        onOpenMessages={handleOpenSenderMessages}
      />
    ),
    [handleOpenSenderMessages]
  );

  const handlePurgeSender = useCallback(
    async (senderEmail: string) => {
      const trimmed = senderEmail.trim();
      if (!trimmed || !validateEmail(trimmed)) {
        setError("Invalid email address provided for purge operation");
        return;
      }
      if (purgingSender) {
        return;
      }

      let started = false;
      setPurgingSender((current) => {
        if (current) {
          return current;
        }
        started = true;
        return trimmed;
      });
      if (!started) {
        return;
      }

      try {
        setError(null); // Clear any previous errors
        await onPurgeSender(trimmed);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to purge sender";
        setError(`Failed to purge sender: ${errorMessage}`);
        console.error("Failed to purge sender", err);
      } finally {
        setPurgingSender((current) => (current === trimmed ? null : current));
      }
    },
    [onPurgeSender, purgingSender]
  );

  const statusActionsTemplate = useCallback(
    (props: SenderRow) => (
      <StatusActionsCell
        senderEmail={props.senderEmail}
        status={props.status}
        isUpdating={statusUpdating === props.senderEmail}
        isPurging={purgingSender === props.senderEmail}
        onStatusChange={onStatusChange}
        onPurge={handlePurgeSender}
      />
    ),
    [handlePurgeSender, purgingSender]
  );

  if (!hasSenderData) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          gap: "16px",
          color: "#6b7280"
        }}
      >
        <div style={{ fontSize: "48px" }}>📭</div>
        <div style={{ fontSize: "18px", fontWeight: 600 }}>No sender insights cached yet</div>
        <div style={{ fontSize: "14px" }}>
          Run a sync for {accountEmail} to populate sender status information.
        </div>
        <ButtonComponent
          cssClass="primary"
          content="Refresh now"
          onClick={() => {
            void handleRefresh();
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "24px",
        gap: "16px",
        overflow: "hidden"
      }}
    >
      <Container fluid className="p-0 d-flex flex-column gap-3" style={{ height: "100%" }}>
        {error && (
          <BootstrapRow className="g-3">
            <Col xs={12}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #fca5a5",
                  backgroundColor: "rgba(252, 165, 165, 0.1)",
                  color: "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px"
                }}
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#b91c1c",
                    cursor: "pointer",
                    fontSize: "18px",
                    padding: "0",
                    lineHeight: 1
                  }}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            </Col>
          </BootstrapRow>
        )}
        <BootstrapRow className="align-items-start justify-content-between g-3">
          <Col xs={12} lg="auto">
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
                Sender status for {accountEmail}
              </h2>
              <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                Review who is blocked, allowed, or neutral. Use the quick actions to adjust a sender and
                changes will propagate across the app instantly.
              </p>
            </div>
          </Col>
          <Col xs="auto">
            <ButtonComponent
              cssClass="ghost-button"
              content="Refresh"
              onClick={() => {
                void handleRefresh();
              }}
            />
          </Col>
        </BootstrapRow>

        <BootstrapRow className="g-3">
          {(Object.keys(statusPalette) as SenderStatus[]).map((status) => {
            const palette = statusPalette[status];
            const total = counts[status] ?? 0;
            return (
              <Col xs={12} sm={6} md={4} lg={3} key={status}>
                <div
                  style={{
                    minWidth: "160px",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${palette.border}`,
                    backgroundColor: palette.bg,
                    color: palette.fg,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    height: "80px", // Fixed height for consistent card sizes
                    justifyContent: "center" // Center content vertically
                  }}
                  role="status"
                  aria-label={`${palette.label} senders: ${total} total`}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em"
                    }}
                    aria-hidden="true"
                  >
                    {palette.label}
                  </span>
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: 700
                    }}
                    aria-hidden="true"
                  >
                    {total}
                  </span>
                </div>
              </Col>
            );
          })}
        </BootstrapRow>

        <div style={{ flex: 1, minHeight: 0 }}>
          <div
            className="mail-grid-wrapper"
            style={{ height: "100%" }}
            role="region"
            aria-label="Sender management grid"
            aria-describedby="grid-description"
          >
            <div id="grid-description" style={{ display: "none" }}>
              Grid showing sender emails with their status, message count, and latest message date.
              Use arrow keys to navigate, Enter to open sender details.
            </div>
            <GridComponent
              dataSource={gridData}
              allowPaging
              pageSettings={{ pageSize: 25, pageSizes: [25, 50, 100] }}
              allowSorting
              allowFiltering
              allowResizing
              height="100%"
              width="100%"
              rowHeight={64}
              selectionSettings={selectionSettings}
              cssClass="mail-grid"
              rowSelected={(args) => {
                if (args.data) {
                  const rowData = args.data as SenderRow;
                  handleOpenSenderMessages(rowData.senderEmail);
                }
              }}
              recordDoubleClick={(args) => {
                if (args.rowData) {
                  const rowData = args.rowData as SenderRow;
                  handleOpenSenderMessages(rowData.senderEmail);
                }
              }}
            >
              <ColumnsDirective>
                <ColumnDirective field="senderDisplay" headerText="Sender" width="240" />
                <ColumnDirective field="senderEmail" headerText="Email" width="260" template={emailTemplate} />
                <ColumnDirective
                  field="messageCount"
                  headerText="Messages"
                  width="120"
                  textAlign="Center"
                  format="N0"
                />
                <ColumnDirective field="latestFormatted" headerText="Latest message" width="200" />
                <ColumnDirective field="status" headerText="Status" width="220" template={statusActionsTemplate} />
              </ColumnsDirective>
              <Inject services={[Page, Sort, Filter, Resize, Selection]} />
            </GridComponent>
          </div>
        </div>
      </Container>

      <SenderMessagesModal
        sender={activeSender}
        open={Boolean(activeSender)}
        onClose={handleCloseMessagesModal}
        onDeleteMessage={onDeleteMessage}
        onRefresh={onRefresh}
        onPurgeSender={handlePurgeSender}
      />
    </div>
  );
}

