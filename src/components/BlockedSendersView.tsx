import { useMemo, useCallback } from "react";
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
import type { SenderGroup, SenderStatus } from "../types";

interface BlockedSendersViewProps {
  senderGroups: SenderGroup[];
  accountEmail: string;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onRefresh: () => Promise<void>;
  hasSenderData: boolean;
}

type SenderRow = {
  senderEmail: string;
  senderDisplay: string;
  status: SenderStatus;
  messageCount: number;
  latestDate?: string | null;
  latestFormatted: string;
  preview: string;
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

  const gridData = useMemo<SenderRow[]>(() => {
    return senderGroups
      .map((group) => {
        const latestMessage = group.messages.reduce((latest, candidate) => {
          if (!candidate.date) return latest;
          if (!latest) return candidate;
          if (!latest.date) return candidate;
          return dayjs(candidate.date).isAfter(dayjs(latest.date)) ? candidate : latest;
        }, group.messages[0] ?? null);

        return {
          senderEmail: group.sender_email,
          senderDisplay: group.sender_display || group.sender_email,
          status: group.status,
          messageCount: group.message_count,
          latestDate: latestMessage?.date,
          latestFormatted: formatDate(latestMessage?.date),
          preview: latestMessage?.analysis_summary ?? latestMessage?.snippet ?? ""
        } satisfies SenderRow;
      })
      .sort((a, b) => {
        const byStatus = statusOrdering[a.status] - statusOrdering[b.status];
        if (byStatus !== 0) return byStatus;
        return a.senderEmail.localeCompare(b.senderEmail, undefined, { sensitivity: "base" });
      });
  }, [senderGroups]);

  const statusTemplate = useCallback((props: SenderRow) => {
    const palette = statusPalette[props.status];
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 12px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: 600,
          backgroundColor: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.border}`
        }}
      >
        {palette.label}
      </span>
    );
  }, []);

  const actionTemplate = useCallback(
    (props: SenderRow) => (
      <EmailActionDropdown
        email={props.senderEmail}
        currentStatus={props.status}
        size="small"
        showLabel={false}
        showIcon
        isUpdating={statusUpdating === props.senderEmail}
        onStatusChange={(nextStatus) => onStatusChange(props.senderEmail, nextStatus)}
      />
    ),
    [onStatusChange, statusUpdating]
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
            Sender status for {accountEmail}
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
            Review who is blocked, allowed, or neutral. Use the quick actions to adjust a sender and
            changes will propagate across the app instantly.
          </p>
        </div>
        <ButtonComponent
          cssClass="ghost-button"
          content="Refresh"
          onClick={() => {
            void onRefresh();
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {(Object.keys(statusPalette) as SenderStatus[]).map((status) => {
          const palette = statusPalette[status];
          const total = counts[status] ?? 0;
          return (
            <div
              key={status}
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
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
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
        >
          <ColumnsDirective>
            <ColumnDirective field="senderDisplay" headerText="Sender" width="240" />
            <ColumnDirective field="senderEmail" headerText="Email" width="260" />
            <ColumnDirective field="status" headerText="Status" width="150" template={statusTemplate} />
            <ColumnDirective
              field="messageCount"
              headerText="Messages"
              width="120"
              textAlign="Center"
              format="N0"
            />
            <ColumnDirective field="latestFormatted" headerText="Latest message" width="200" />
            <ColumnDirective field="preview" headerText="Recent insight" width="320" clipMode="EllipsisWithTooltip" />
            <ColumnDirective field="actions" headerText="Quick actions" width="150" template={actionTemplate} />
          </ColumnsDirective>
          <Inject services={[Page, Sort, Filter, Resize, Selection]} />
        </GridComponent>
      </div>
    </div>
  );
}
