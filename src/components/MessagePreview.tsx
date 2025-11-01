import { useCallback } from "react";
import { Button as BootstrapButton } from "react-bootstrap";
import dayjs from "dayjs";

interface Message {
  uid: string;
  subject?: string;
  date?: string | null;
  snippet?: string | null;
  analysis_summary?: string | null;
  analysis_categories: string[];
}

interface MessagePreviewProps {
  message: Message | null;
  llmAnalysis: string | null;
  analysisError: string | null;
  isAnalyzingMessage: boolean;
  onAnalyzeMessage: () => void;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value; // Return original invalid value for debugging
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

export function MessagePreview({
  message,
  llmAnalysis,
  analysisError,
  isAnalyzingMessage,
  onAnalyzeMessage
}: MessagePreviewProps) {
  const handleAnalyzeClick = useCallback(() => {
    onAnalyzeMessage();
  }, [onAnalyzeMessage]);

  if (!message) {
    return (
      <div className="sender-message-preview-empty">
        Select a message to peek at its details.
      </div>
    );
  }

  return (
    <div className="sender-message-preview-content">
      <div className="sender-message-preview-header">
        <h3>{message.subject || "(No subject)"}</h3>
        <span>{formatDate(message.date) || "—"}</span>
      </div>
      <div className="sender-message-preview-meta">
        <strong>UID:</strong> {message.uid}
      </div>
      <div className="sender-message-preview-actions" style={{ marginTop: "12px" }}>
        <BootstrapButton
          size="sm"
          variant="primary"
          onClick={handleAnalyzeClick}
          disabled={isAnalyzingMessage}
        >
          {isAnalyzingMessage ? "Analyzing..." : "Analyze with AI"}
        </BootstrapButton>
      </div>
      {message.analysis_categories.length > 0 && (
        <div className="sender-message-preview-categories">
          {message.analysis_categories.map((category) => (
            <span key={category} className="sender-message-preview-chip">
              {category}
            </span>
          ))}
        </div>
      )}
      {message.analysis_summary && (
        <div className="sender-message-preview-section">
          <h4>Summary</h4>
          <p>{message.analysis_summary}</p>
        </div>
      )}
      {message.snippet && (
        <div className="sender-message-preview-section">
          <h4>Snippet</h4>
          <p>{message.snippet}</p>
        </div>
      )}
      {(llmAnalysis || analysisError) && (
        <div className="sender-message-preview-section">
          <h4>AI Analysis</h4>
          {analysisError ? (
            <p style={{ color: "#dc2626" }}>Error: {analysisError}</p>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{llmAnalysis}</div>
          )}
        </div>
      )}
      {!message.analysis_summary && !message.snippet && (
        <div className="sender-message-preview-empty">No preview available for this message.</div>
      )}
    </div>
  );
}