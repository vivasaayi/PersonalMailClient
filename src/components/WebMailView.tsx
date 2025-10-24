import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ListViewComponent,
  Inject as ListInject,
  Virtualization
} from "@syncfusion/ej2-react-lists";
import type { SelectEventArgs } from "@syncfusion/ej2-react-lists";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { DropDownButtonComponent } from "@syncfusion/ej2-react-splitbuttons";
import dayjs from "dayjs";
import type { EmailSummary } from "../types";
import type { EmailInsightRecord } from "./EmailList";
import { EmailActionDropdown } from "./EmailActionDropdown";

interface WebMailViewProps {
  emails: EmailSummary[];
  messageInsights: Record<string, EmailInsightRecord | undefined>;
}

type GroupMode = "none" | "sender-name" | "sender-email" | "by-day";

interface GroupedEmails {
  key: string;
  label: string;
  emails: EmailSummary[];
  count: number;
}

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = dayjs(value);
  const now = dayjs();
  
  if (date.isSame(now, "day")) {
    return date.format("h:mm A");
  } else if (date.isSame(now.subtract(1, "day"), "day")) {
    return "Yesterday";
  } else if (date.isAfter(now.subtract(7, "day"))) {
    return date.format("ddd");
  } else {
    return date.format("MMM D");
  }
};

export function WebMailView({ emails, messageInsights }: WebMailViewProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const prevGroupModeRef = useRef<GroupMode>("none");

  // Group emails by sender
  const groupedEmails = useMemo<GroupedEmails[]>(() => {
    if (groupMode === "none") return [];

    const groups = new Map<string, GroupedEmails>();
    
    emails.forEach((email) => {
      let groupKey: string;
      let groupLabel: string;

      if (groupMode === "sender-name") {
        groupKey = email.sender.display_name || email.sender.email;
        groupLabel = groupKey;
      } else if (groupMode === "sender-email") {
        groupKey = email.sender.email;
        groupLabel = email.sender.email;
      } else if (groupMode === "by-day") {
        const date = dayjs(email.date);
        groupKey = date.format("YYYY-MM-DD");
        const today = dayjs();
        if (date.isSame(today, "day")) {
          groupLabel = "Today";
        } else if (date.isSame(today.subtract(1, "day"), "day")) {
          groupLabel = "Yesterday";
        } else {
          groupLabel = date.format("dddd, MMMM D, YYYY");
        }
      } else {
        return;
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          emails: [],
          count: 0
        });
      }
      
      const group = groups.get(groupKey)!;
      group.emails.push(email);
      group.count++;
    });

    const sortedGroups = Array.from(groups.values());
    
    // Sort by day groups chronologically (most recent first), others by count
    if (groupMode === "by-day") {
      return sortedGroups.sort((a, b) => b.key.localeCompare(a.key));
    } else {
      return sortedGroups.sort((a, b) => b.count - a.count);
    }
  }, [emails, groupMode]);

  const toggleGroup = useCallback((senderEmail: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(senderEmail)) {
        next.delete(senderEmail);
      } else {
        next.add(senderEmail);
      }
      return next;
    });
  }, []);

  // Auto-expand all groups when switching to grouped mode
  useEffect(() => {
    // Only run when groupMode actually changes, not on every render
    if (prevGroupModeRef.current !== groupMode) {
      prevGroupModeRef.current = groupMode;
      
      if (groupMode !== "none") {
        setExpandedGroups(new Set(groupedEmails.map(g => g.key)));
      } else {
        setExpandedGroups(new Set());
      }
    }
  }, [groupMode, groupedEmails]);

  const listData = useMemo(() => {
    return emails.map((email) => ({
      id: email.uid,
      email
    }));
  }, [emails]);

  const handleEmailSelect = useCallback((args: SelectEventArgs) => {
    const data = args.data as { email: EmailSummary };
    setSelectedEmail(data.email);
  }, []);

  const listTemplate = useCallback((data: { email: EmailSummary }) => {
    const email = data.email;
    const isSelected = selectedEmail?.uid === email.uid;
    const insight = messageInsights[email.uid];
    
    // Determine background color based on sender status
    let itemBgColor = "#ffffff";
    if (insight?.message?.status === "blocked") {
      itemBgColor = "#fa8072"; // salmon
    } else if (insight?.message?.status === "allowed") {
      itemBgColor = "#90ee90"; // light green
    }
    
    if (isSelected) {
      itemBgColor = "#eff6ff"; // Override with selected color
    }
    
    return (
      <div
        className={`webmail-list-item${isSelected ? " selected" : ""}`}
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          cursor: "pointer",
          backgroundColor: itemBgColor,
          transition: "background-color 0.15s"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
          <div onClick={() => setSelectedEmail(email)} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#111827",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  marginRight: "12px"
                }}
              >
                {email.sender.display_name || email.sender.email}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  flexShrink: 0,
                  marginRight: "8px"
                }}
              >
                {formatDate(email.date)}
              </div>
            </div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#374151",
                marginBottom: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {email.subject || "(No subject)"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {insight?.message.analysis_summary || ""}
            </div>
            {insight?.message.analysis_sentiment && (
              <div style={{ marginTop: "6px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 500,
                    backgroundColor:
                      insight.message.analysis_sentiment === "positive"
                        ? "#dcfce7"
                        : insight.message.analysis_sentiment === "negative"
                        ? "#fee2e2"
                        : "#f3f4f6",
                    color:
                      insight.message.analysis_sentiment === "positive"
                        ? "#16a34a"
                        : insight.message.analysis_sentiment === "negative"
                        ? "#dc2626"
                        : "#6b7280"
                  }}
                >
                  {insight.message.analysis_sentiment}
                </span>
              </div>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: "8px" }}>
            <EmailActionDropdown
              email={email.sender.email}
              currentStatus={insight?.message?.status || 'neutral'}
              size="small"
              showLabel={false}
              showIcon={true}
            />
          </div>
        </div>
      </div>
    );
  }, [selectedEmail, messageInsights]);

  if (emails.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "48px",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 600, color: "#111827" }}>
          No messages
        </h3>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
          Run a sync to fetch your recent emails
        </p>
      </div>
    );
  }

  const renderGroupedView = () => {
    return (
      <div style={{ flex: 1, overflow: "auto" }}>
        {groupedEmails.map((group) => {
          const isExpanded = expandedGroups.has(group.key);
          return (
            <div key={group.key}>
              {/* Group Header */}
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "#f3f4f6",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontWeight: 600,
                  fontSize: "14px",
                  color: "#374151"
                }}
              >
                <div 
                  onClick={() => toggleGroup(group.key)}
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px",
                    cursor: "pointer",
                    flex: 1
                  }}
                >
                  <span style={{ fontSize: "12px" }}>{isExpanded ? "▼" : "▶"}</span>
                  <span>{group.label}</span>
                  <span
                    style={{
                      fontSize: "12px",
                      padding: "2px 8px",
                      backgroundColor: "#e5e7eb",
                      borderRadius: "12px",
                      color: "#6b7280"
                    }}
                  >
                    {group.count}
                  </span>
                </div>
                {(groupMode === "sender-name" || groupMode === "sender-email") && group.emails.length > 0 && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EmailActionDropdown
                      email={group.emails[0].sender.email}
                      currentStatus={messageInsights[group.emails[0].uid]?.message?.status || 'neutral'}
                      size="small"
                      showLabel={false}
                      showIcon={true}
                    />
                  </div>
                )}
              </div>
              
              {/* Group Emails */}
              {isExpanded && group.emails.map((email) => {
                const isSelected = selectedEmail?.uid === email.uid;
                const insight = messageInsights[email.uid];
                
                // Determine background color based on sender status
                let itemBgColor = "#ffffff";
                if (insight?.message?.status === "blocked") {
                  itemBgColor = "#fa8072"; // salmon
                } else if (insight?.message?.status === "allowed") {
                  itemBgColor = "#90ee90"; // light green
                }
                
                if (isSelected) {
                  itemBgColor = "#eff6ff"; // Override with selected color
                }
                
                return (
                  <div
                    key={email.uid}
                    className={`webmail-list-item${isSelected ? " selected" : ""}`}
                    style={{
                      padding: "12px 16px 12px 40px",
                      borderBottom: "1px solid #e5e7eb",
                      cursor: "pointer",
                      backgroundColor: itemBgColor,
                      transition: "background-color 0.15s",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start"
                    }}
                  >
                    <div onClick={() => setSelectedEmail(email)} style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 500,
                            color: "#374151",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                            marginRight: "12px"
                          }}
                        >
                          {email.subject || "(No subject)"}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            flexShrink: 0,
                            marginRight: "8px"
                          }}
                        >
                          {formatDate(email.date)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {insight?.message.analysis_summary || ""}
                      </div>
                      {insight?.message.analysis_sentiment && (
                        <div style={{ marginTop: "6px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 500,
                              backgroundColor:
                                insight.message.analysis_sentiment === "positive"
                                  ? "#dcfce7"
                                  : insight.message.analysis_sentiment === "negative"
                                  ? "#fee2e2"
                                  : "#f3f4f6",
                              color:
                                insight.message.analysis_sentiment === "positive"
                                  ? "#16a34a"
                                  : insight.message.analysis_sentiment === "negative"
                                  ? "#dc2626"
                                  : "#6b7280"
                            }}
                          >
                            {insight.message.analysis_sentiment}
                          </span>
                        </div>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: "8px" }}>
                      <EmailActionDropdown
                        email={email.sender.email}
                        currentStatus={insight?.message?.status || 'neutral'}
                        size="small"
                        showLabel={false}
                        showIcon={true}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="webmail-container" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Email List Pane */}
      <div
        className="webmail-list-pane"
        style={{
          width: selectedEmail ? "360px" : "100%",
          borderRight: selectedEmail ? "1px solid #e5e7eb" : "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.2s"
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>
            Inbox ({emails.length})
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <ButtonComponent
              cssClass={groupMode === "none" ? "e-small e-primary" : "e-small e-outline"}
              content="List"
              onClick={() => {
                setGroupMode("none");
                setExpandedGroups(new Set());
              }}
            />
            <DropDownButtonComponent
              items={[
                { text: "By Sender Name", id: "sender-name" },
                { text: "By Sender Email", id: "sender-email" },
                { text: "By Day", id: "by-day" }
              ]}
              cssClass={`webmail-group-dropdown ${groupMode !== "none" ? "e-small e-primary" : "e-small e-outline"}`}
              content="Group By"
              select={(args: any) => {
                setGroupMode(args.item.id as GroupMode);
              }}
            />
          </div>
        </div>
        
        {groupMode !== "none" ? (
          renderGroupedView()
        ) : (
          <div style={{ flex: 1, overflow: "auto" }}>
            <ListViewComponent
              dataSource={listData}
              template={listTemplate}
              select={handleEmailSelect}
              cssClass="webmail-listview"
              enableVirtualization={true}
            >
              <ListInject services={[Virtualization]} />
            </ListViewComponent>
          </div>
        )}
      </div>

      {/* Email Detail Pane */}
      {selectedEmail && (
        <div
          className="webmail-detail-pane"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "#ffffff"
          }}
        >
          {/* Email Header */}
          <div
            style={{
              padding: "24px",
              borderBottom: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: 600,
                  color: "#111827",
                  flex: 1,
                  marginRight: "16px"
                }}
              >
                {selectedEmail.subject || "(No subject)"}
              </h2>
              <button
                onClick={() => setSelectedEmail(null)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#6b7280"
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#3b82f6",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  fontWeight: 600
                }}
              >
                {(selectedEmail.sender.display_name || selectedEmail.sender.email).charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#111827" }}>
                  {selectedEmail.sender.display_name || selectedEmail.sender.email}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  {selectedEmail.sender.email}
                </div>
              </div>
              <EmailActionDropdown
                email={selectedEmail.sender.email}
                currentStatus={messageInsights[selectedEmail.uid]?.message?.status || 'neutral'}
                size="normal"
                showLabel={true}
                showIcon={true}
              />
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                {dayjs(selectedEmail.date).format("MMM D, YYYY h:mm A")}
              </div>
            </div>
          </div>

          {/* Email Body */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "24px"
            }}
          >
            {(() => {
              const insight = messageInsights[selectedEmail.uid];
              return (
                <div>
                  {insight?.message.analysis_summary && (
                    <div
                      style={{
                        padding: "16px",
                        backgroundColor: "#f0f9ff",
                        border: "1px solid #bae6fd",
                        borderRadius: "8px",
                        marginBottom: "24px"
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#0369a1", marginBottom: "8px" }}>
                        AI Summary
                      </div>
                      <div style={{ fontSize: "14px", color: "#075985", lineHeight: "1.6" }}>
                        {insight.message.analysis_summary}
                      </div>
                      {insight.message.analysis_sentiment && (
                        <div style={{ marginTop: "12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 500,
                              backgroundColor:
                                insight.message.analysis_sentiment === "positive"
                                  ? "#dcfce7"
                                  : insight.message.analysis_sentiment === "negative"
                                  ? "#fee2e2"
                                  : "#f3f4f6",
                              color:
                                insight.message.analysis_sentiment === "positive"
                                  ? "#16a34a"
                                  : insight.message.analysis_sentiment === "negative"
                                  ? "#dc2626"
                                  : "#6b7280"
                            }}
                          >
                            Sentiment: {insight.message.analysis_sentiment}
                          </span>
                        </div>
                      )}
                      {insight.message.analysis_categories.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {insight.message.analysis_categories.map((category) => (
                            <span
                              key={category}
                              style={{
                                padding: "2px 8px",
                                backgroundColor: "#e0f2fe",
                                border: "1px solid #bae6fd",
                                borderRadius: "4px",
                                fontSize: "11px",
                                color: "#0369a1"
                              }}
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#374151",
                      lineHeight: "1.8",
                      whiteSpace: "pre-wrap",
                      fontFamily: "system-ui, -apple-system, sans-serif"
                    }}
                  >
                    {insight?.message.snippet || "(No preview available)"}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
