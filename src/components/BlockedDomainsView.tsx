import { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Container, Row as BootstrapRow, Col, Modal, Button as BootstrapButton } from "react-bootstrap";
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
import type { SenderGroup, SenderStatus } from "../types";
import { EmailActionDropdown } from "./EmailActionDropdown";
import { SenderMessagesModal } from "./SenderMessagesModal";

interface BlockedDomainsViewProps {
  senderGroups: SenderGroup[];
  accountEmail: string;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onRefresh: () => Promise<void>;
  onDeleteMessage: (senderEmail: string, uid: string, options?: { suppressNotifications?: boolean }) => Promise<void>;
  onPurgeSender: (senderEmail: string) => Promise<void>;
  hasSenderData: boolean;
}

type DomainAggregate = {
  domain: string;
  senders: SenderGroup[];
  totalMessages: number;
  blockedCount: number;
  allowedCount: number;
  neutralCount: number;
  latestDate?: string | null;
  latestPreview: string;
  status: SenderStatus;
};

type DomainRow = {
  domain: string;
  senderCount: number;
  messageCount: number;
  latestFormatted: string;
  preview: string;
  status: SenderStatus;
};

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

const UNKNOWN_DOMAIN = "(unknown domain)";

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

const aggregateDomainStatus = (aggregate: DomainAggregate): SenderStatus => {
  if (aggregate.blockedCount > 0) {
    return "blocked";
  }
  if (aggregate.allowedCount > 0) {
    return "allowed";
  }
  return "neutral";
};

const latestMessageForGroup = (group: SenderGroup) => {
  return group.messages.reduce((latest, candidate) => {
    if (!candidate?.date) {
      return latest;
    }
    if (!latest?.date) {
      return candidate;
    }
    return dayjs(candidate.date).isAfter(dayjs(latest.date)) ? candidate : latest;
  }, group.messages[0] ?? null);
};

const extractDomain = (email: string) => {
  const parts = email.split("@");
  if (parts.length < 2) {
    return UNKNOWN_DOMAIN;
  }
  return parts[1]?.trim().toLowerCase() || UNKNOWN_DOMAIN;
};

type DomainDetailsModalProps = {
  domain: DomainAggregate | null;
  open: boolean;
  onClose: () => void;
  onSelectSender: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
};

function DomainDetailsModal({
  domain,
  open,
  onClose,
  onSelectSender,
  onStatusChange,
  statusUpdating
}: DomainDetailsModalProps) {
  const handleEscapeKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      onClose();
    },
    [onClose]
  );

  return (
    <Modal
      show={open}
      onHide={onClose}
      size="lg"
      centered
      scrollable
      backdrop="static"
      onEscapeKeyDown={handleEscapeKeyDown}
    >
      <Modal.Header closeButton>
        <Modal.Title>Domain details for {domain?.domain ?? ""}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {domain ? (
          <div className="d-flex flex-column gap-3">
            <div className="d-flex flex-wrap gap-3">
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: `1px solid ${statusPalette[domain.status].border}`,
                  backgroundColor: statusPalette[domain.status].bg,
                  color: statusPalette[domain.status].fg,
                  minWidth: 180
                }}
              >
                <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Primary status
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>{statusPalette[domain.status].label}</div>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #e5e7eb", minWidth: 160 }}>
                <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Senders
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>{domain.senders.length}</div>
              </div>
              <div style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #e5e7eb", minWidth: 160 }}>
                <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Messages
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700 }}>{domain.totalMessages}</div>
              </div>
            </div>
            <div className="d-flex flex-column gap-2">
              {domain.senders
                .slice()
                .sort((a, b) => {
                  const byStatus = statusOrdering[a.status] - statusOrdering[b.status];
                  if (byStatus !== 0) return byStatus;
                  return a.sender_email.localeCompare(b.sender_email, undefined, { sensitivity: "base" });
                })
                .map((sender) => {
                  const palette = statusPalette[sender.status];
                  return (
                    <div
                      key={sender.sender_email}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        padding: "12px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{sender.sender_display || sender.sender_email}</div>
                          <div style={{ color: "#6b7280", fontSize: "13px" }}>{sender.sender_email}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#4b5563" }}>
                          <span>{sender.message_count} message{sender.message_count === 1 ? "" : "s"}</span>
                          <span>
                            Latest: {formatDate(latestMessageForGroup(sender)?.date) || "—"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <BootstrapButton
                            size="sm"
                            variant="outline-primary"
                            onClick={() => onSelectSender(sender.sender_email)}
                          >
                            View messages
                          </BootstrapButton>
                          <EmailActionDropdown
                            email={sender.sender_email}
                            currentStatus={sender.status}
                            size="small"
                            showLabel
                            showIcon
                            isUpdating={statusUpdating === sender.sender_email}
                            onStatusChange={(nextStatus) => onStatusChange(sender.sender_email, nextStatus)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="text-center" style={{ color: "#6b7280" }}>
            No domain selected
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <BootstrapButton variant="secondary" onClick={onClose}>
          Close
        </BootstrapButton>
      </Modal.Footer>
    </Modal>
  );
}

export default function BlockedDomainsView({
  senderGroups,
  accountEmail,
  onStatusChange,
  statusUpdating,
  onRefresh,
  onDeleteMessage,
  onPurgeSender,
  hasSenderData
}: BlockedDomainsViewProps) {
  const selectionSettings = useMemo<SelectionSettingsModel>(
    () => ({ mode: "Row", type: "Single" }),
    []
  );

  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [activeSenderEmail, setActiveSenderEmail] = useState<string | null>(null);

  const { domainRows, domainIndex } = useMemo(() => {
    const map = new Map<string, DomainAggregate>();

    senderGroups.forEach((group) => {
      const domainKey = extractDomain(group.sender_email);
      const existing = map.get(domainKey);
      const latestMessage = latestMessageForGroup(group);

      if (!existing) {
        map.set(domainKey, {
          domain: domainKey,
          senders: [group],
          totalMessages: group.message_count,
          blockedCount: group.status === "blocked" ? 1 : 0,
          allowedCount: group.status === "allowed" ? 1 : 0,
          neutralCount: group.status === "neutral" ? 1 : 0,
          latestDate: latestMessage?.date,
          latestPreview: latestMessage?.analysis_summary ?? latestMessage?.snippet ?? "",
          status: "neutral"
        });
        return;
      }

      existing.senders.push(group);
      existing.totalMessages += group.message_count;
      existing.blockedCount += group.status === "blocked" ? 1 : 0;
      existing.allowedCount += group.status === "allowed" ? 1 : 0;
      existing.neutralCount += group.status === "neutral" ? 1 : 0;

      if (latestMessage?.date) {
        if (!existing.latestDate || dayjs(latestMessage.date).isAfter(dayjs(existing.latestDate))) {
          existing.latestDate = latestMessage.date;
          existing.latestPreview = latestMessage.analysis_summary ?? latestMessage.snippet ?? "";
        }
      }
    });

    const rows: DomainRow[] = Array.from(map.values()).map((aggregate) => {
      const status = aggregateDomainStatus(aggregate);
      aggregate.status = status;

      return {
        domain: aggregate.domain,
        senderCount: aggregate.senders.length,
        messageCount: aggregate.totalMessages,
        latestFormatted: formatDate(aggregate.latestDate),
        preview: aggregate.latestPreview,
        status
      } satisfies DomainRow;
    });

    rows.sort((a, b) => {
      const byStatus = statusOrdering[a.status] - statusOrdering[b.status];
      if (byStatus !== 0) return byStatus;
      return a.domain.localeCompare(b.domain, undefined, { sensitivity: "base" });
    });

    return { domainRows: rows, domainIndex: map };
  }, [senderGroups]);

  const summaryCounts = useMemo(() => {
    return domainRows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { blocked: 0, allowed: 0, neutral: 0 } as Record<SenderStatus, number>
    );
  }, [domainRows]);

  const activeDomainData = useMemo(() => {
    if (!activeDomain) {
      return null;
    }
    return domainIndex.get(activeDomain) ?? null;
  }, [activeDomain, domainIndex]);

  const activeSender = useMemo(() => {
    if (!activeSenderEmail) {
      return null;
    }
    return senderGroups.find((group) => group.sender_email === activeSenderEmail) ?? null;
  }, [activeSenderEmail, senderGroups]);

  const handleOpenDomainDetails = useCallback((domainKey: string) => {
    setActiveSenderEmail(null);
    setActiveDomain(domainKey);
  }, []);

  const handleCloseDomainDetails = useCallback(() => {
    setActiveDomain(null);
  }, []);

  const handleSelectSender = useCallback((senderEmail: string) => {
    setActiveSenderEmail(senderEmail);
  }, []);

  const handleCloseSenderModal = useCallback(() => {
    setActiveSenderEmail(null);
  }, []);

  const domainTemplate = useCallback(
    (props: DomainRow) => (
      <button type="button" className="sender-email-link" onClick={() => handleOpenDomainDetails(props.domain)}>
        {props.domain}
      </button>
    ),
    [handleOpenDomainDetails]
  );

  const statusActionsTemplate = useCallback(
    (props: DomainRow) => {
      const palette = statusPalette[props.status];
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            width: "100%"
          }}
        >
          <BootstrapButton
            size="sm"
            variant="outline-primary"
            onClick={() => handleOpenDomainDetails(props.domain)}
          >
            View senders
          </BootstrapButton>
        </div>
      );
    },
    [handleOpenDomainDetails]
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
        <div style={{ fontSize: "48px" }}>🌐</div>
        <div style={{ fontSize: "18px", fontWeight: 600 }}>No domain insights cached yet</div>
        <div style={{ fontSize: "14px" }}>
          Run a sync for {accountEmail} to populate domain-level status information.
        </div>
        <ButtonComponent
          cssClass="primary"
          content="Refresh now"
          onClick={() => {
            void onRefresh();
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
        <BootstrapRow className="align-items-start justify-content-between g-3">
          <Col xs={12} lg="auto">
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
                Domain status for {accountEmail}
              </h2>
              <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                Review sender activity grouped by domain. Drill into a domain to adjust individual senders and
                inspect their cached messages.
              </p>
            </div>
          </Col>
          <Col xs="auto">
            <ButtonComponent
              cssClass="ghost-button"
              content="Refresh"
              onClick={() => {
                void onRefresh();
              }}
            />
          </Col>
        </BootstrapRow>

        <BootstrapRow className="g-3">
          {(Object.keys(statusPalette) as SenderStatus[]).map((status) => {
            const palette = statusPalette[status];
            const total = summaryCounts[status] ?? 0;
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
                    gap: "4px"
                  }}
                >
                  <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {palette.label}
                  </span>
                  <span style={{ fontSize: "24px", fontWeight: 700 }}>{total}</span>
                </div>
              </Col>
            );
          })}
        </BootstrapRow>

        <div style={{ flex: 1, minHeight: 0 }}>
          <div className="mail-grid-wrapper" style={{ height: "100%" }}>
            <GridComponent
              dataSource={domainRows}
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
            >
              <ColumnsDirective>
                <ColumnDirective field="domain" headerText="Domain" width="220" template={domainTemplate} />
                <ColumnDirective field="senderCount" headerText="Senders" width="120" textAlign="Center" format="N0" />
                <ColumnDirective field="messageCount" headerText="Messages" width="140" textAlign="Center" format="N0" />
                <ColumnDirective field="latestFormatted" headerText="Latest message" width="200" />
                <ColumnDirective field="status" headerText="Status" width="220" template={statusActionsTemplate} />
              </ColumnsDirective>
              <Inject services={[Page, Sort, Filter, Resize, Selection]} />
            </GridComponent>
          </div>
        </div>
      </Container>

      <DomainDetailsModal
        domain={activeDomainData}
        open={Boolean(activeDomainData) && !activeSender}
        onClose={handleCloseDomainDetails}
        onSelectSender={handleSelectSender}
        onStatusChange={onStatusChange}
        statusUpdating={statusUpdating}
      />

      <SenderMessagesModal
        sender={activeSender}
        open={Boolean(activeSender)}
        onClose={handleCloseSenderModal}
        onDeleteMessage={onDeleteMessage}
        onRefresh={onRefresh}
        onPurgeSender={onPurgeSender}
      />
    </div>
  );
}
