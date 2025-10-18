import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Inject,
  Page,
  Sort,
  Filter,
  Group,
  Resize,
  DetailRow,
  Selection,
} from "@syncfusion/ej2-react-grids";
import type { SelectionSettingsModel } from "@syncfusion/ej2-react-grids";
import { Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import type { AnalyzedMessage, EmailSummary } from "../types";
import { MailGridContainer } from "./mailgrid/MailGridContainer";
import {
  GroupingToggle,
  type GroupOption,
} from "./mailgrid/GroupingToggle";
import { EmailDetailPanel } from "./email/EmailDetailPanel";

export type EmailInsightRecord = {
  senderEmail: string;
  senderDisplay: string;
  message: AnalyzedMessage;
};

interface EmailListProps {
  emails: EmailSummary[];
  messageInsights: Record<string, EmailInsightRecord | undefined>;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return dayjs(value).format("MMM D, YYYY h:mm A");
};

function NoRecentMessages() {
  return (
    <Stack height="100%" alignItems="center" justifyContent="center" spacing={1}>
      <Typography variant="subtitle1">No messages in the last fetch window.</Typography>
      <Typography variant="body2" color="text.secondary">
        Pull to refresh or run a sync to fetch new mail.
      </Typography>
    </Stack>
  );
}

export default function EmailList({ emails, messageInsights }: EmailListProps) {
  const gridRef = useRef<GridComponent | null>(null);
  const [groupOption, setGroupOption] = useState<GroupOption>("none");
  const pageSettings = useMemo(
    () => ({ pageSize: 25, pageSizes: [25, 50, 100] }),
    [],
  );

  const selectionSettings = useMemo<SelectionSettingsModel>(
    () => ({ mode: "Row", type: "Single" }),
    [],
  );

  const gridData = useMemo(
    () =>
      emails.map((email) => {
        const senderEmail = email.sender.email;

        return {
          ...email,
          senderEmail,
          senderDomain: senderEmail.split("@")[1] || senderEmail,
        };
      }),
    [emails],
  );

  type GridEmail = EmailSummary & {
    senderDomain: string;
    senderEmail: string;
  };

  const subjectTemplate = useCallback(
    (props: GridEmail) => (
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {props.subject || "(No subject)"}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {props.sender.display_name ?? props.sender.email}
        </Typography>
      </Stack>
    ),
    [],
  );

  const senderTemplate = useCallback(
    (props: GridEmail) => (
      <Typography variant="body2" noWrap>
        {props.sender.email}
      </Typography>
    ),
    [],
  );

  const receivedTemplate = useCallback(
    (props: GridEmail) => (
      <Typography variant="body2" noWrap>
        {formatDate(props.date)}
      </Typography>
    ),
    [],
  );

  const detailTemplate = useCallback(
    (data: GridEmail) => {
      const insight = messageInsights[data.uid] ?? null;

      return (
        <EmailDetailPanel email={data} insight={insight} />
      );
    },
    [messageInsights],
  );

  const groupingOptions = useMemo(
    () => [
      {
        value: "none" as const,
        label: "No grouping",
        hint: "Show all messages in a flat list",
      },
      {
        value: "sender" as const,
        label: "Group by sender",
        hint: "Cluster messages by the sender's email address",
      },
      {
        value: "sender-message" as const,
        label: "Sender + subject",
        hint: "Nest by sender, then message subject",
      },
    ],
    [],
  );

  const applyGrouping = useCallback(
    (option: GroupOption) => {
      const grid = gridRef.current;
      const groupModule = grid?.groupModule;

      if (!grid || !groupModule) {
        return;
      }

      groupModule.clearGrouping();

      if (option === "sender") {
        groupModule.groupColumn("senderEmail");
      } else if (option === "sender-message") {
        groupModule.groupColumn("senderEmail");
        groupModule.groupColumn("subject");
      }
    },
    [],
  );

  useEffect(() => {
    applyGrouping(groupOption);
  }, [applyGrouping, groupOption, gridData]);

  const handleGroupingChange = useCallback((next: GroupOption) => {
    setGroupOption(next);
  }, []);

  if (emails.length === 0) {
    return <NoRecentMessages />;
  }

  return (
    <MailGridContainer
      title="Message insights"
      subtitle="Review recent messages along with AI-powered analysis. Use grouping to cluster related items."
      toolbar={
        <GroupingToggle
          value={groupOption}
          onChange={handleGroupingChange}
          options={groupingOptions}
        />
      }
    >
      <GridComponent
        ref={gridRef}
        key={gridData.length}
        dataSource={gridData}
        allowPaging
        pageSettings={pageSettings}
        allowSorting
        allowFiltering
        allowResizing
        allowGrouping
        groupSettings={{ showDropArea: false, showToggleButton: false }}
        height="100%"
        width="100%"
        rowHeight={60}
        selectionSettings={selectionSettings}
        detailTemplate={detailTemplate}
        cssClass="mail-grid"
      >
        <ColumnsDirective>
          <ColumnDirective
            field="senderEmail"
            headerText="Sender email"
            visible={false}
          />
          <ColumnDirective
            field="senderDomain"
            headerText="Domain"
            visible={false}
          />
          <ColumnDirective
            field="subject"
            headerText="Subject"
            width="250"
            clipMode="EllipsisWithTooltip"
            template={subjectTemplate}
          />
          <ColumnDirective
            field="sender"
            headerText="Sender"
            width="220"
            template={senderTemplate}
          />
          <ColumnDirective
            field="date"
            headerText="Received"
            width="180"
            template={receivedTemplate}
          />
        </ColumnsDirective>
        <Inject services={[Page, Sort, Filter, Group, Resize, DetailRow, Selection]} />
      </GridComponent>
    </MailGridContainer>
  );
}