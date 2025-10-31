import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import dayjs from "dayjs";
import { Modal, Button as BootstrapButton, Form } from "react-bootstrap";
import type { SenderGroup } from "../types";

interface SenderMessagesModalProps {
  sender: SenderGroup | null;
  open: boolean;
  onClose: () => void;
  onDeleteMessage: (senderEmail: string, uid: string, options?: { suppressNotifications?: boolean }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onPurgeSender: (senderEmail: string) => Promise<void>;
}

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return value;
  }
  return parsed.format("MMM D, YYYY h:mm A");
};

export function SenderMessagesModal({
  sender,
  open,
  onClose,
  onDeleteMessage,
  onRefresh,
  onPurgeSender
}: SenderMessagesModalProps) {
  const [selectedMessageUids, setSelectedMessageUids] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const [deletingUids, setDeletingUids] = useState<Set<string>>(new Set());
  const [llmAnalysis, setLlmAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzingMessage, setIsAnalyzingMessage] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const copyResetTimeout = useRef<number | null>(null);

  const messages = useMemo(() => sender?.messages ?? [], [sender]);
  const totalMessages = messages.length;
  const allMessagesSelected = totalMessages > 0 && messages.every((message) => selectedMessageUids.has(message.uid));
  const selectedCount = selectedMessageUids.size;
  const previewMessage = useMemo(
    () => (previewUid ? messages.find((message) => message.uid === previewUid) ?? null : null),
    [messages, previewUid]
  );
  useEffect(() => {
    setLlmAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzingMessage(false);
  }, [previewMessage?.uid]);
  const isBusy = isDeleting || deletingUids.size > 0 || isPurging;

  useEffect(() => {
    setSelectedMessageUids(new Set());
    setIsDeleting(false);
    setPreviewUid(null);
    setDeletingUids(new Set());
    setLlmAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzingMessage(false);
    setIsPurging(false);
  }, [sender]);

  useEffect(() => {
    if (messages.length === 0) {
      setPreviewUid(null);
      return;
    }
    setPreviewUid((current) => {
      if (current && messages.some((message) => message.uid === current)) {
        return current;
      }
      return messages[0]?.uid ?? null;
    });
  }, [messages]);

  const handleToggleMessage = useCallback((uid: string) => {
    setSelectedMessageUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (messages.length === 0) {
      return;
    }
    setSelectedMessageUids((prev) => {
      const isAllSelected = messages.every((message) => prev.has(message.uid));
      return isAllSelected ? new Set() : new Set(messages.map((message) => message.uid));
    });
  }, [messages]);

  const handleClose = useCallback(() => {
    if (isDeleting || deletingUids.size > 0) {
      return;
    }
    onClose();
  }, [deletingUids, isDeleting, onClose]);

  const handleDeleteSelected = useCallback(async () => {
    if (!sender || selectedMessageUids.size === 0 || isBusy) {
      return;
    }

    setIsDeleting(true);
    const uidsToDelete = Array.from(selectedMessageUids);
    try {
      for (const uid of uidsToDelete) {
        await onDeleteMessage(sender.sender_email, uid);
      }
      await onRefresh();
      setSelectedMessageUids(new Set());
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete messages", error);
    } finally {
      setIsDeleting(false);
    }
  }, [isBusy, onClose, onDeleteMessage, onRefresh, selectedMessageUids, sender]);

  const handlePurgeAll = useCallback(async () => {
    if (!sender || isPurging || isBusy) {
      return;
    }

    setIsPurging(true);
    const senderEmail = sender.sender_email;
    try {
      await onPurgeSender(senderEmail);
      setSelectedMessageUids(new Set());
      setPreviewUid(null);
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to purge messages for sender", error);
    } finally {
      setIsPurging(false);
    }
  }, [isBusy, isPurging, onClose, onPurgeSender, sender]);

  useEffect(() => {
    return () => {
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
        copyResetTimeout.current = null;
      }
    };
  }, []);

  const senderEmail = sender?.sender_email || "";
  const senderDisplay = sender?.sender_display || senderEmail;

  const handleCopyEmail = useCallback(async () => {
    if (!senderEmail) {
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(senderEmail);
      } else {
        const tempInput = document.createElement("input");
        tempInput.value = senderEmail;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      }

      setEmailCopied(true);
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
      copyResetTimeout.current = window.setTimeout(() => {
        setEmailCopied(false);
        copyResetTimeout.current = null;
      }, 2000);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to copy sender email", error);
    }
  }, [senderEmail]);

  const handlePeekMessage = useCallback(
    (uid: string) => {
      if (isBusy) {
        return;
      }
      setPreviewUid(uid);
    },
    [isBusy]
  );

  const handleDeleteSingle = useCallback(
    async (uid: string) => {
      if (!sender || isBusy) {
        return;
      }
      if (deletingUids.has(uid)) {
        return;
      }

      const nextPreviewCandidate = messages.find((message) => message.uid !== uid)?.uid ?? null;
      setDeletingUids((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
      try {
        await onDeleteMessage(sender.sender_email, uid);
        await onRefresh();
        setSelectedMessageUids((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
        setPreviewUid((current) => (current === uid ? nextPreviewCandidate : current));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to delete message", error);
      } finally {
        setDeletingUids((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
      }
    },
    [deletingUids, isBusy, messages, onDeleteMessage, onRefresh, sender]
  );

  const analyzePreviewMessage = useCallback(async () => {
    if (!previewMessage) {
      return;
    }

    setIsAnalyzingMessage(true);
    setAnalysisError(null);

    const senderLabel = sender?.sender_display || sender?.sender_email || "Unknown sender";
    const rawContent =
      previewMessage.analysis_summary || previewMessage.snippet || "No snippet available.";
    const trimmedContent = rawContent.length > 800 ? `${rawContent.slice(0, 797)}...` : rawContent;
    const prompt = `Analyze this email and provide a brief assessment:

Subject: ${previewMessage.subject || "(No subject)"}
From: ${senderLabel}
Date: ${formatDate(previewMessage.date)}
Snippet: ${trimmedContent}

Please answer these questions:
1. Is this email spam? (Yes/No/Probably)
2. What category does this email belong to? (e.g., work, personal, marketing, newsletter, etc.)
3. Is this email important? (High/Medium/Low importance)

Keep your response concise and format it clearly.`;

    try {
      const response = await invoke<string>("analyze_with_llm", {
        prompt,
        max_tokens: 256
      });
      setLlmAnalysis(response?.trim() || "No analysis available");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAnalyzingMessage(false);
    }
  }, [previewMessage, sender]);

  const title = sender ? `Messages from ${senderDisplay}` : "Messages";

  return (
    <Modal
      show={open}
      onHide={handleClose}
      size="xl"
      fullscreen
      centered
      backdrop={isBusy ? "static" : true}
      keyboard={!isBusy}
      dialogClassName="sender-messages-modal"
      contentClassName="sender-messages-modal-content"
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        if (!isBusy) {
          handleClose();
        }
      }}
    >
      <Modal.Header closeButton={!isBusy} className="sender-messages-modal-header">
        <Modal.Title>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span>{title}</span>
            {senderEmail && (
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
                <code style={{ padding: "2px 6px", borderRadius: "4px", background: "#f3f4f6" }}>{senderEmail}</code>
                <BootstrapButton size="sm" variant={emailCopied ? "success" : "outline-secondary"} onClick={handleCopyEmail}>
                  {emailCopied ? "Copied" : "Copy"}
                </BootstrapButton>
              </span>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="sender-messages-modal-body">
        {sender && totalMessages > 0 ? (
          <>
            <div className="sender-messages-toolbar">
              <Form.Check
                type="checkbox"
                id="sender-messages-select-all"
                label="Select all"
                className="sender-messages-select-all"
                checked={allMessagesSelected && totalMessages > 0}
                disabled={isBusy || totalMessages === 0}
                onChange={handleToggleAll}
              />
              <span className="sender-messages-selection-count">
                {selectedCount === 0
                  ? "No messages selected"
                  : selectedCount === 1
                    ? "1 message selected"
                    : `${selectedCount} messages selected`}
              </span>
            </div>
            <div className="sender-messages-body">
              <div className="sender-message-list">
                {messages.map((message) => {
                  const isSelected = selectedMessageUids.has(message.uid);
                  const isPreviewed = previewUid === message.uid;
                  const isDeletingThisRow = deletingUids.has(message.uid) || isDeleting;
                  const rowDisabled = isBusy;
                  return (
                    <div
                      key={message.uid}
                      className={`sender-message-item${isSelected ? " is-selected" : ""}${
                        isPreviewed ? " is-previewed" : ""
                      }`}
                    >
                      <Form.Check
                        type="checkbox"
                        checked={isSelected}
                        disabled={rowDisabled}
                        onChange={() => handleToggleMessage(message.uid)}
                        className="sender-message-checkbox"
                      />
                      <div
                        className="sender-message-content"
                        onClick={() => {
                          if (rowDisabled) {
                            return;
                          }
                          handlePeekMessage(message.uid);
                        }}
                        role="button"
                        tabIndex={rowDisabled ? -1 : 0}
                        aria-disabled={rowDisabled}
                        onKeyDown={(event) => {
                          if (rowDisabled) {
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handlePeekMessage(message.uid);
                          }
                        }}
                      >
                        <div className="sender-message-header">
                          <div className="sender-message-subject">{message.subject || "(No subject)"}</div>
                          <div className="sender-message-date">{formatDate(message.date) || "—"}</div>
                        </div>
                        <div className="sender-message-meta">UID: {message.uid}</div>
                        <div className="sender-message-snippet">
                          {message.analysis_summary || message.snippet || "No summary captured for this message."}
                        </div>
                      </div>
                      <div className="sender-message-actions">
                        <BootstrapButton
                          size="sm"
                          variant={isPreviewed ? "primary" : "outline-primary"}
                          onClick={() => handlePeekMessage(message.uid)}
                          disabled={rowDisabled}
                        >
                          {isPreviewed ? "Viewing" : "Peek"}
                        </BootstrapButton>
                        <BootstrapButton
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleDeleteSingle(message.uid)}
                          disabled={rowDisabled}
                        >
                          {isDeletingThisRow ? "Deleting…" : "Delete"}
                        </BootstrapButton>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sender-message-preview">
                {previewMessage ? (
                  <div className="sender-message-preview-content">
                    <div className="sender-message-preview-header">
                      <h3>{previewMessage.subject || "(No subject)"}</h3>
                      <span>{formatDate(previewMessage.date) || "—"}</span>
                    </div>
                    <div className="sender-message-preview-meta">
                      <strong>UID:</strong> {previewMessage.uid}
                    </div>
                    <div className="sender-message-preview-actions" style={{ marginTop: "12px" }}>
                      <BootstrapButton
                        size="sm"
                        variant="primary"
                        onClick={analyzePreviewMessage}
                        disabled={isAnalyzingMessage}
                      >
                        {isAnalyzingMessage ? "Analyzing..." : "Analyze with AI"}
                      </BootstrapButton>
                    </div>
                    {previewMessage.analysis_categories.length > 0 && (
                      <div className="sender-message-preview-categories">
                        {previewMessage.analysis_categories.map((category) => (
                          <span key={category} className="sender-message-preview-chip">
                            {category}
                          </span>
                        ))}
                      </div>
                    )}
                    {previewMessage.analysis_summary && (
                      <div className="sender-message-preview-section">
                        <h4>Summary</h4>
                        <p>{previewMessage.analysis_summary}</p>
                      </div>
                    )}
                    {previewMessage.snippet && (
                      <div className="sender-message-preview-section">
                        <h4>Snippet</h4>
                        <p>{previewMessage.snippet}</p>
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
                    {!previewMessage.analysis_summary && !previewMessage.snippet && (
                      <div className="sender-message-preview-empty">No preview available for this message.</div>
                    )}
                  </div>
                ) : (
                  <div className="sender-message-preview-empty">Select a message to peek at its details.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="sender-messages-empty">
            <div className="sender-messages-empty-icon">📭</div>
            <div className="sender-messages-empty-title">No messages cached for this sender yet</div>
            <div className="sender-messages-empty-subtitle">Run a sync to pull their latest messages.</div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="sender-messages-modal-footer">
        <div className="sender-messages-footer-meta">
          {totalMessages} total message{totalMessages === 1 ? "" : "s"}
        </div>
        <div className="sender-messages-footer-actions">
          <BootstrapButton
            variant="outline-secondary"
            onClick={handleClose}
            disabled={isBusy}
            className="sender-messages-button"
          >
            Close
          </BootstrapButton>
          <BootstrapButton
            variant="outline-danger"
            onClick={handlePurgeAll}
            disabled={!sender || totalMessages === 0 || isBusy}
            className="sender-messages-button"
          >
            {isPurging ? "Purging…" : "Purge all messages"}
          </BootstrapButton>
          <BootstrapButton
            variant="danger"
            onClick={handleDeleteSelected}
            disabled={selectedCount === 0 || isBusy}
            className="sender-messages-button"
          >
            {isDeleting
              ? "Deleting…"
              : selectedCount <= 1
                ? "Delete message"
                : `Delete ${selectedCount} messages`}
          </BootstrapButton>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
