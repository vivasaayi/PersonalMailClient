import { useCallback, useMemo } from "react";
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
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import type { AnalyzedMessage, EmailSummary, SenderStatus } from "../types";

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
        emails.map((email) => ({
          ...email,
          senderDomain: email.sender.email.split("@")[1] || email.sender.email,
        })),
      [emails],
    );

  type GridEmail = EmailSummary & { senderDomain: string };

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
        <Box sx={{ p: 3, backgroundColor: "background.default" }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {data.subject || "(No subject)"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDate(data.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                From {insight?.senderDisplay ?? data.sender.display_name ?? data.sender.email}
                {" "}({insight?.senderEmail ?? data.sender.email})
              </Typography>
            </Box>

            <Divider />

            {insight ? (
              <Stack spacing={2}>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Chip label={`Status: ${statusLabel(insight.message.status)}`} size="small" variant="outlined" />
                  {insight.message.analysis_sentiment && (
                    <Chip
                      label={`Sentiment: ${insight.message.analysis_sentiment}`}
                      size="small"
                      color={
                        insight.message.analysis_sentiment === "positive"
                          ? "success"
                          : insight.message.analysis_sentiment === "negative"
                            ? "error"
                            : "default"
                      }
                    />
                  )}
                </Box>
                <Typography variant="body2">
                  {insight.message.analysis_summary ?? insight.message.snippet ?? "No preview available."}
                </Typography>
                {insight.message.analysis_categories.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {insight.message.analysis_categories.map((category) => (
                      <Chip
                        key={category}
                        label={category}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.7rem" }}
                      />
                    ))}
                  </Box>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No additional analysis is available yet for this message.
              </Typography>
            )}
          </Stack>
        </Box>
      );
    },
    [messageInsights],
  );

  if (emails.length === 0) {
    return <NoRecentMessages />;
  }

  return (
    <Box className="mail-grid-wrapper" sx={{ height: "100%", width: "100%" }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          backgroundColor: "#ffffff",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Drag a column header into the grouping bar to cluster related messages. Click a row to open its insight panel.
        </Typography>
      </Box>
      <GridComponent
        key={gridData.length}
        dataSource={gridData}
        allowPaging
        pageSettings={pageSettings}
        allowSorting
        allowFiltering
        allowResizing
        allowGrouping
        groupSettings={{ showDropArea: false, showToggleButton: true }}
        height="100%"
        width="100%"
        rowHeight={60}
        selectionSettings={selectionSettings}
        detailTemplate={detailTemplate}
        cssClass="mail-grid"
      >
        <ColumnsDirective>
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
    </Box>
  );
}