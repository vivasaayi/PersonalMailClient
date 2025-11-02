import { useMemo } from "react";
import EmailList from "./EmailList";
import type { EmailSummary } from "../types";
import type { EmailInsightRecord } from "./EmailList";

interface EmailListContainerProps {
  emails: EmailSummary[];
  messageInsights: Record<string, EmailInsightRecord | undefined>;
  onEmailAction: (emailId: string, action: string) => Promise<void>;
}

export function EmailListContainer({
  emails,
  messageInsights,
  onEmailAction
}: EmailListContainerProps) {
  const sortedEmails = useMemo(() => {
    return [...emails].sort((a, b) =>
      new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
  }, [emails]);

  if (emails.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
        No emails to display
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "hidden" }}>
      <EmailList
        emails={sortedEmails}
        messageInsights={messageInsights}
      />
    </div>
  );
}