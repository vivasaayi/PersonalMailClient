import { useMemo } from "react";
import EmailList from "./EmailList";
import type { EmailSummary } from "../types";

interface EmailListContainerProps {
  emails: EmailSummary[];
  selectedEmailId: string | null;
  onEmailSelect: (emailId: string) => void;
  onEmailAction: (emailId: string, action: string) => Promise<void>;
}

export function EmailListContainer({
  emails,
  selectedEmailId,
  onEmailSelect,
  onEmailAction
}: EmailListContainerProps) {
  const sortedEmails = useMemo(() => {
    return [...emails].sort((a, b) =>
      new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
  }, [emails]);

  return (
    <div style={{ flex: 1, overflow: "hidden" }}>
      <EmailList
        emails={sortedEmails}
        messageInsights={{}} // TODO: Pass actual message insights
      />
    </div>
  );
}