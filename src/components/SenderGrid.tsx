import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import dayjs from "dayjs";
import type { SenderGroup, SenderStatus } from "../types";
import { MailGridContainer } from "./mailgrid/MailGridContainer";
import { GroupingToggle, type GroupOption } from "./mailgrid/GroupingToggle";
import { EmailActionDropdown } from "./EmailActionDropdown";

interface SenderGridProps {
  senderGroups: SenderGroup[];
  expandedSenderForAccount: string | null;
  onToggleExpansion: (senderEmail: string) => void;
  onStatusChange: (senderEmail: string, status: SenderStatus) => Promise<void>;
  statusUpdating: string | null;
  onDeleteMessage: (senderEmail: string, uid: string, options?: { suppressNotifications?: boolean }) => Promise<void>;
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
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } }, [
        createElement('div', { style: { overflow: 'hidden', flex: 1 } }, [
          createElement('div', { style: { fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, props.sender_display || props.sender_email),
          createElement('div', { style: { fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, props.sender_email)
        ])
      ])
    ),
    [],
  );

  const messageCountTemplate = useCallback(
    (props: GridSenderGroup) => (
      createElement('span', {
        style: { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px', backgroundColor: '#f3f4f6' }
      }, `${props.message_count} message${props.message_count === 1 ? "" : "s"}`)
    ),
    [],
  );

  const statusTemplate = useCallback(
    (props: GridSenderGroup) =>
      createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'center' } },
        createElement(EmailActionDropdown, {
          email: props.sender_email,
          currentStatus: props.status,
          size: 'small',
          showLabel: true,
          showIcon: true,
          isUpdating: statusUpdating === props.sender_email,
          onStatusChange: (nextStatus) => onStatusChange(props.sender_email, nextStatus),
          onActionComplete: () => {
            // Status change will trigger a re-render via parent state update
          }
        })
      ),
    [onStatusChange, statusUpdating],
  );

  const detailTemplate = useCallback(
    (data: GridSenderGroup) => {
      if (data.messages.length === 0) {
        return createElement('div', {
          style: { padding: '24px', textAlign: 'center', color: '#6b7280' }
        }, 'No messages to display');
      }

      return createElement('div', { style: { padding: '24px', backgroundColor: '#f9fafb' } }, [
        createElement('div', { key: 'header', style: { marginBottom: '16px' } }, [
          createElement('div', {
            key: 'title',
            style: { fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }
          }, data.sender_display || data.sender_email),
          createElement('div', {
            key: 'email',
            style: { fontSize: '14px', color: '#6b7280' }
          }, data.sender_email)
        ]),
        createElement('hr', { key: 'divider', style: { border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' } }),
        createElement('div', { key: 'messages', style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
          data.messages.map((message) => {
            const deleteKey = `${data.sender_email}::${message.uid}`;
            return createElement('div', {
              key: message.uid,
              style: { border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }
            }, [
              createElement('div', { key: 'content', style: { padding: '16px' } }, [
                createElement('div', { key: 'header-row', style: { display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '12px' } }, [
                  createElement('div', { key: 'text', style: { flex: 1, minWidth: 0 } }, [
                    createElement('div', {
                      key: 'subject',
                      style: { fontSize: '16px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }
                    }, message.subject || "(No subject)"),
                    createElement('div', {
                      key: 'date',
                      style: { fontSize: '12px', color: '#6b7280' }
                    }, formatDate(message.date))
                  ]),
                  createElement(ButtonComponent, {
                    key: 'delete',
                    cssClass: 'delete-button',
                    content: pendingDeleteUid === deleteKey ? "Deleting…" : "Delete",
                    disabled: pendingDeleteUid === deleteKey,
                    onClick: () => onDeleteMessage(data.sender_email, message.uid)
                  })
                ]),
                message.analysis_sentiment && createElement('span', {
                  key: 'sentiment',
                  style: {
                    display: 'inline-block',
                    padding: '4px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: '#ffffff',
                    marginBottom: '8px',
                    color: message.analysis_sentiment === "positive" ? '#16a34a' : message.analysis_sentiment === "negative" ? '#dc2626' : '#6b7280'
                  }
                }, `Sentiment: ${message.analysis_sentiment}`),
                createElement('div', {
                  key: 'summary',
                  style: { fontSize: '14px', color: '#111827', lineHeight: '1.5', marginBottom: '8px' }
                }, message.analysis_summary ?? message.snippet ?? "No preview available."),
                message.analysis_categories.length > 0 && createElement('div', {
                  key: 'categories',
                  style: { display: 'flex', gap: '8px', flexWrap: 'wrap' }
                }, message.analysis_categories.map(category =>
                  createElement('span', {
                    key: category,
                    style: { padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px', backgroundColor: '#ffffff' }
                  }, category)
                )),
                message.flags && createElement('div', {
                  key: 'flags',
                  style: { fontSize: '12px', color: '#6b7280', marginTop: '8px' }
                }, `Flags: ${message.flags}`)
              ])
            ]);
          })
        )
      ]);
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
  }, [applyGrouping, groupOption]);

  const handleGroupingChange = useCallback((next: GroupOption) => {
    setGroupOption(next);
  }, []);

  if (isEmpty) {
    return createElement('div', {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        backgroundColor: '#ffffff'
      }
    }, [
      createElement('div', { key: 'content', style: { padding: '24px', textAlign: 'center' } }, [
        createElement('div', { key: 'icon', style: { fontSize: '48px', color: '#9ca3af', marginBottom: '16px' } }, '👥'),
        createElement('div', {
          key: 'title',
          style: { fontSize: '20px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }
        }, 'No cached messages yet'),
        createElement('div', {
          key: 'subtitle',
          style: { fontSize: '14px', color: '#6b7280' }
        }, 'Run a full sync to populate sender insights.')
      ])
    ]);
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