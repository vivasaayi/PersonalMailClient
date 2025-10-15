import dayjs from "dayjs";
import type { EmailSummary } from "../types";

interface EmailListProps {
  emails: EmailSummary[];
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return dayjs(value).format("MMM D, YYYY h:mm A");
};

export default function EmailList({ emails }: EmailListProps) {
  return (
    <div className="tab-content">
      {emails.length === 0 ? (
        <p className="empty">No messages in the last fetch window.</p>
      ) : (
        <ul className="email-list">
          {emails.map((email) => (
            <li key={email.uid}>
              <div className="email-subject">
                {email.subject || "(No subject)"}
              </div>
              <div className="email-meta">
                <span>{email.sender.display_name ?? email.sender.email}</span>
                {email.date && <span>{formatDate(email.date)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}