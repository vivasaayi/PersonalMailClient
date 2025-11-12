import { createElement } from "react";

const SYNCFUSION_BANNER_OFFSET = 72;

interface GlobalProgressBarProps {
  deleteProgress: { completed: number; total: number; failed: number } | null;
  purgeProgress: { senderEmail: string; completed: number; total: number } | null;
  remoteDeleteProgress: { pending: number; completed: number; failed: number; total: number; summary?: string } | null;
}

function GlobalProgressBar({
  deleteProgress,
  purgeProgress,
  remoteDeleteProgress
}: GlobalProgressBarProps) {
  const progress = deleteProgress || purgeProgress || remoteDeleteProgress;
  if (!progress) return null;

  let processed: number;
  let percent: number;
  let text: string;
  let barColor = "#dc2626";
  let detailsText: string | null = null;

  if (deleteProgress) {
    processed = deleteProgress.completed + deleteProgress.failed;
    percent = deleteProgress.total > 0 ? (processed / deleteProgress.total) * 100 : 0;
    text = `Deleting messages... ${processed} / ${deleteProgress.total}${deleteProgress.failed > 0 ? ` (${deleteProgress.failed} failed)` : ''}`;
    detailsText = deleteProgress.failed > 0 ? `${deleteProgress.completed} successful, ${deleteProgress.failed} failed` : null;
  } else if (purgeProgress) {
    processed = purgeProgress.completed;
    percent = purgeProgress.total > 0 ? (processed / purgeProgress.total) * 100 : 0;
    text = `Purging messages from ${purgeProgress.senderEmail}... ${processed} / ${purgeProgress.total}`;
  } else if (remoteDeleteProgress) {
    const completed = remoteDeleteProgress.completed;
    const failed = remoteDeleteProgress.failed;
    const pending = remoteDeleteProgress.pending;
    processed = completed + failed;
    percent = remoteDeleteProgress.total > 0 ? (processed / remoteDeleteProgress.total) * 100 : 0;
    text = `Removing messages from server… ${processed} / ${remoteDeleteProgress.total}`;
    if (pending > 0) {
      text += ` · ${pending} remaining`;
    }
    if (failed > 0) {
      text += ` (${failed} failed)`;
      barColor = "#f59e0b";
      detailsText = `${completed} removed · ${failed} failed`;
    } else {
      barColor = "#34d399";
      detailsText = remoteDeleteProgress.summary ?? null;
    }
  } else {
    return null;
  }

  return createElement('div', {
    style: {
      position: 'fixed',
      top: `${SYNCFUSION_BANNER_OFFSET}px`,
      left: 0,
      right: 0,
      zIndex: 1200,
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      padding: '12px 24px'
    }
  }, [
    createElement('div', {
      key: 'progress-container',
      style: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '400px' }
    }, [
      createElement('div', {
        key: 'progress-text',
        style: { fontSize: '0.875rem', color: '#374151', fontWeight: '500' }
      }, text),
      createElement('div', {
        key: 'progress-bar',
        style: {
          width: '100%',
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '3px',
          overflow: 'hidden'
        }
      }, createElement('div', {
        style: {
          width: `${percent}%`,
          height: '100%',
          backgroundColor: barColor,
          transition: 'width 0.3s ease'
        }
      })),
      detailsText && createElement('div', {
        key: 'progress-details',
        style: { fontSize: '0.75rem', color: '#6b7280' }
      }, detailsText)
    ].filter(Boolean))
  ]);
}

export default GlobalProgressBar;