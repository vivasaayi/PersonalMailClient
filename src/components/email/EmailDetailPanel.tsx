import { createElement } from 'react';
import dayjs from "dayjs";
import type { EmailSummary, AnalyzedMessage } from "../../types";

interface EmailInsightLike {
  senderEmail: string;
  senderDisplay: string;
  message: AnalyzedMessage;
}

interface EmailDetailPanelProps {
  email: EmailSummary & { senderDomain: string };
  insight: EmailInsightLike | null;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const formatted = dayjs(value);
  if (!formatted.isValid()) {
    return value;
  }
  return formatted.format("MMM D, YYYY h:mm A");
};

const statusLabel = (insight: EmailInsightLike | null) => {
  switch (insight?.message.status) {
    case "allowed":
      return "Allowed";
    case "blocked":
      return "Blocked";
    default:
      return "Neutral";
  }
};

export function EmailDetailPanel({ email, insight }: EmailDetailPanelProps) {
  return createElement('div', {
    style: { padding: '24px', backgroundColor: '#f9fafb' }
  }, [
    createElement('div', { key: 'header', style: { marginBottom: '16px' } }, [
      createElement('div', {
        key: 'subject',
        style: { fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }
      }, email.subject || "(No subject)"),
      createElement('div', {
        key: 'date',
        style: { fontSize: '14px', color: '#6b7280', marginBottom: '4px' }
      }, formatDate(email.date)),
      createElement('div', {
        key: 'sender',
        style: { fontSize: '14px', color: '#6b7280' }
      }, `From ${insight?.senderDisplay ?? email.sender.display_name ?? email.sender.email} (${insight?.senderEmail ?? email.sender.email})`)
    ]),

    createElement('hr', { key: 'divider', style: { border: 'none', borderTop: '1px solid #e5e7eb', margin: '16px 0' } }),

    insight ? createElement('div', { key: 'content', style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, [
      createElement('div', { key: 'chips', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        createElement('span', {
          key: 'status',
          style: { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px', backgroundColor: '#ffffff' }
        }, `Status: ${statusLabel(insight)}`),
        insight.message.analysis_sentiment && createElement('span', {
          key: 'sentiment',
          style: {
            padding: '4px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '12px',
            backgroundColor: '#ffffff',
            color: insight.message.analysis_sentiment === "positive" ? '#16a34a' : insight.message.analysis_sentiment === "negative" ? '#dc2626' : '#6b7280'
          }
        }, `Sentiment: ${insight.message.analysis_sentiment}`)
      ]),
      createElement('div', {
        key: 'summary',
        style: { fontSize: '14px', color: '#111827', lineHeight: '1.5' }
      }, insight.message.analysis_summary ?? insight.message.snippet ?? "No preview available."),
      insight.message.analysis_categories.length > 0 && createElement('div', {
        key: 'categories',
        style: { display: 'flex', gap: '8px', flexWrap: 'wrap' }
      }, insight.message.analysis_categories.map(category =>
        createElement('span', {
          key: category,
          style: { padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '11px', backgroundColor: '#ffffff' }
        }, category)
      ))
    ]) : createElement('div', {
      key: 'no-analysis',
      style: { fontSize: '14px', color: '#6b7280' }
    }, "No additional analysis is available yet for this message.")
  ]);
}
