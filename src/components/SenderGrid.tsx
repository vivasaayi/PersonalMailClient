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
import type {
  RowSelectEventArgs,
  RowDeselectEventArgs,
  SelectionSettingsModel,
} from "@syncfusion/ej2-react-grids";
import { Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { Delete as DeleteIcon, Group as GroupIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import type { SenderGroup, SenderStatus } from "../types";
import { MailGridContainer } from "./mailgrid/MailGridContainer";
import { GroupingToggle, type GroupOption } from "./mailgrid/GroupingToggle";

interface SenderGridProps {
  senderGroups: SenderGroup[];
  expandedSenderForAccount: string | null;
  onToggleExpansion: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string) => Promise<void>;
  pendingDeleteUid: string | null;
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

export default function SenderGrid({
  senderGroups,
  expandedSenderForAccount,
  onToggleExpansion,
  onStatusChange,
  statusUpdating,
  onDeleteMessage,
  pendingDeleteUid,
}: SenderGridProps) {
  const gridRef = useRef<GridComponent | null>(null);
  const [groupOption, setGroupOption] = useState<GroupOption>("none");

  const pageSettings = useMemo(
    () => ({ pageSize: 10, pageSizes: [10, 25, 50] }),
    [],
  );

  const selectionSettings = useMemo<SelectionSettingsModel>(
    () => ({ mode: "Row", type: "Single" }),
    [],
  );

  const gridData = useMemo(
    () =>
      senderGroups.map((group) => ({
        ...group,
        senderDomain: group.sender_email.split("@")[1] || group.sender_email,
      })),
    [senderGroups],
  );

  const isEmpty = senderGroups.length === 0;

    const groupingOptions = useMemo(
      () => [
        {
          value: "none" as const,
          label: "No grouping",
          hint: "View senders as a flat list",
        },
        {
          value: "sender" as const,
          label: "Group by domain",
          hint: "Organize senders by their email domain",
        },
        {
          value: "sender-message" as const,
          label: "Group by status",
          hint: "Cluster senders by current allow/block status",
        },
      ],
      [],
    );

  const setGridRef = useCallback((grid: GridComponent | null) => {
    gridRef.current = grid;
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    if (expandedSenderForAccount) {
      const rowIndex = senderGroups.findIndex(
        (group) => group.sender_email === expandedSenderForAccount,
      );
      if (rowIndex >= 0) {
        const rowElement = grid.getRowByIndex(rowIndex);
        if (rowElement) {
          grid.detailRowModule?.collapseAll();
          grid.detailRowModule?.expand(rowElement as HTMLTableRowElement);
        }
      }
    } else {
      grid.detailRowModule?.collapseAll();
    }
  }, [expandedSenderForAccount, senderGroups]);

  type GridSenderGroup = SenderGroup & { senderDomain: string };

  const senderTemplate = useCallback(
    (props: GridSenderGroup) => (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
        <Box sx={{ overflow: "hidden" }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {props.sender_display || props.sender_email}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {props.sender_email}
          </Typography>
        </Box>
      </Stack>
    ),
    [],
  );

  const messageCountTemplate = useCallback(
    (props: GridSenderGroup) => (
      <Chip
        label={`${props.message_count} message${props.message_count === 1 ? "" : "s"}`}
        size="small"
        variant="outlined"
      />
    ),
    [],
  );

  const statusTemplate = useCallback(
    (props: GridSenderGroup) => {
      const statuses: SenderStatus[] = ["allowed", "neutral", "blocked"];
      const isUpdating = statusUpdating === props.sender_email;

      return (
        <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
          {statuses.map((status) => (
            <Button
              key={status}
              size="small"
              variant={props.status === status ? "contained" : "outlined"}
              color={
                status === "allowed"
                  ? "success"
                  : status === "blocked"
                    ? "error"
                    : "inherit"
              }
              onClick={() => onStatusChange(props.sender_email, status)}
              disabled={isUpdating || props.status === status}
              sx={{ minWidth: "auto", px: 1, py: 0.5 }}
            >
              {statusLabel(status)}
            </Button>
          ))}
        </Box>
      );
    },
    [onStatusChange, statusUpdating],
  );

  const detailTemplate = useCallback(
    (data: GridSenderGroup) => {
      if (data.messages.length === 0) {
        return (
          <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
            No messages to display
          </Box>
        );
      }

      return (
        <Box sx={{ p: 3, backgroundColor: "#f9fafb" }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                {data.sender_display || data.sender_email}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.sender_email}
              </Typography>
            </Box>

            <Divider />

            <Stack spacing={2}>
              {data.messages.map((message) => {
                const deleteKey = `${data.sender_email}::${message.uid}`;
                return (
                  <Card key={message.uid} variant="outlined" sx={{ overflow: "hidden" }}>
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap gutterBottom>
                              {message.subject || "(No subject)"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(message.date)}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            startIcon={<DeleteIcon />}
                            onClick={() => onDeleteMessage(data.sender_email, message.uid)}
                            disabled={pendingDeleteUid === deleteKey}
                          >
                            {pendingDeleteUid === deleteKey ? "Deleting…" : "Delete"}
                          </Button>
                        </Box>

                        {message.analysis_sentiment && (
                          <Chip
                            label={`Sentiment: ${message.analysis_sentiment}`}
                            size="small"
                            color={
                              message.analysis_sentiment === "positive"
                                ? "success"
                                : message.analysis_sentiment === "negative"
                                  ? "error"
                                  : "default"
                            }
                          />
                        )}

                        <Typography variant="body2">
                          {message.analysis_summary ?? message.snippet ?? "No preview available."}
                        </Typography>

                        {message.analysis_categories.length > 0 && (
                          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                            {message.analysis_categories.map((category) => (
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

                        {message.flags && (
                          <Typography variant="caption" color="text.secondary">
                            Flags: {message.flags}
                          </Typography>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Stack>
        </Box>
      );
    },
    [onDeleteMessage, pendingDeleteUid],
  );

  const handleRowSelected = useCallback(
    (args: RowSelectEventArgs) => {
      if (!args.isInteracted || !args.data) {
        return;
      }
      const data = args.data as SenderGroup;
      const rowElement = args.row as HTMLTableRowElement | undefined;
      if (rowElement) {
        gridRef.current?.detailRowModule?.expand(rowElement);
      }
      onToggleExpansion(data.sender_email);
    },
    [onToggleExpansion],
  );

  const handleRowDeselected = useCallback(
    (args: RowDeselectEventArgs) => {
      if (!args.isInteracted || !args.data) {
        return;
      }
      const data = args.data as SenderGroup;
      const rowElement = args.row as HTMLTableRowElement | undefined;
      if (rowElement) {
        gridRef.current?.detailRowModule?.collapse(rowElement);
      }
      if (expandedSenderForAccount === data.sender_email) {
        onToggleExpansion(data.sender_email);
      }
    },
    [expandedSenderForAccount, onToggleExpansion],
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
        groupModule.groupColumn("senderDomain");
      } else if (option === "sender-message") {
        groupModule.groupColumn("status");
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

  if (isEmpty) {
    return (
      <Card sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CardContent>
          <Stack spacing={1} alignItems="center" textAlign="center">
            <GroupIcon fontSize="large" color="disabled" />
            <Typography variant="h6" color="text.secondary">
              No cached messages yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Run a full sync to populate sender insights.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <MailGridContainer
      title="Sender insights"
      subtitle="Select a sender to inspect recent messages, manage their status, or clean up mail."
      toolbar={
        <GroupingToggle
          value={groupOption}
          onChange={handleGroupingChange}
          options={groupingOptions}
        />
      }
    >
      <GridComponent
        key={gridData.length}
        ref={setGridRef}
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
        rowHeight={70}
        selectionSettings={selectionSettings}
        detailTemplate={detailTemplate}
        rowSelected={handleRowSelected}
        rowDeselected={handleRowDeselected}
        cssClass="mail-grid"
      >
        <ColumnsDirective>
          <ColumnDirective
            field="senderDomain"
            headerText="Domain"
            visible={false}
          />
          <ColumnDirective
            field="status"
            headerText="Status"
            visible={false}
          />
          <ColumnDirective
            field="sender_display"
            headerText="Sender"
            width="250"
            template={senderTemplate}
          />
          <ColumnDirective
            field="message_count"
            headerText="Messages"
            width="140"
            template={messageCountTemplate}
          />
          <ColumnDirective
            field="status"
            headerText="Actions"
            width="260"
            template={statusTemplate}
          />
        </ColumnsDirective>
        <Inject services={[Page, Sort, Filter, Group, Resize, DetailRow, Selection]} />
      </GridComponent>
    </MailGridContainer>
  );
}