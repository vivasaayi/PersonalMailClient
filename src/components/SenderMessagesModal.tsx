import { useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import dayjs from "dayjs";
import { Modal, Button as BootstrapButton } from "react-bootstrap";
import type { SenderGroup } from "../types";
import { MessageList } from "./MessageList";
import { MessagePreview } from "./MessagePreview";
import { MessageToolbar } from "./MessageToolbar";
import { ModalFooter } from "./ModalFooter";
import { VirtualizedMessageList } from "./VirtualizedMessageList";
import MessageModalErrorBoundary from "./MessageModalErrorBoundary";
import { useMessageModalState } from "../hooks/useMessageModalState";
import { validateEmail, validateUid, validateAnalysisPrompt } from "../utils/validation";
import { useNotifications } from "../stores/notifications";

interface SenderMessagesModalProps {
  sender: SenderGroup | null;
  open: boolean;
  onClose: () => void;
  onDeleteMessage: (senderEmail: string, uid: string, options?: { suppressNotifications?: boolean }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onPurgeSender: (senderEmail: string) => Promise<void>;
}

type SortOrder = "newest" | "oldest";

// Component has been successfully decomposed into smaller components:
// - MessageList: Handles the list of messages with selection and sorting
// - MessagePreview: Handles the preview pane with AI analysis
// - MessageToolbar: Handles the toolbar with sort controls and bulk actions
// - ModalFooter: Handles the footer with action buttons and metadata

export function SenderMessagesModal({
  sender,
  open,
  onClose,
  onDeleteMessage,
  onRefresh,
  onPurgeSender
}: SenderMessagesModalProps) {
  const messages = useMemo(() => sender?.messages ?? [], [sender]);
  const totalMessages = messages.length;
  const { notifySuccess, notifyInfo } = useNotifications();

  const modalState = useMessageModalState(totalMessages);
  const {
    selectedMessageUids,
    allMessagesSelected,
    previewUid,
    sortOrder,
    emailCopied,
    copyError,
    isDeleting,
    deletingUids,
    isPurging,
    isAnalyzingMessage,
    softDeletedUids,
    llmAnalysis,
    analysisError,
    setSelectedMessageUids,
    toggleMessageSelection,
    toggleAllMessages,
    clearSelection,
    setPreviewUid,
    setSortOrder,
    setEmailCopied,
    setCopyError,
    setIsDeleting,
    setDeletingUids,
    addDeletingUid,
    removeDeletingUid,
    setIsPurging,
    setIsAnalyzingMessage,
    addSoftDeletedUid,
    setLlmAnalysis,
    setAnalysisError,
    resetModalState,
    resetAnalysisState,
  } = modalState;

  const copyResetTimeout = useRef<number | null>(null);
  const sortedMessages = useMemo(() => {
    const filtered = messages.filter(message => !softDeletedUids.has(message.uid));

    // For small lists, use simple sort
    if (filtered.length <= 100) {
      const sorted = [...filtered];
      sorted.sort((a, b) => {
        const dateA = dayjs(a.date);
        const dateB = dayjs(b.date);

        if (!dateA.isValid() && !dateB.isValid()) return 0;
        if (!dateA.isValid()) return sortOrder === "newest" ? 1 : -1;
        if (!dateB.isValid()) return sortOrder === "newest" ? -1 : 1;

        const comparison = dateA.isAfter(dateB) ? 1 : dateA.isBefore(dateB) ? -1 : 0;
        return sortOrder === "newest" ? -comparison : comparison;
      });
      return sorted;
    }

    // For larger lists, pre-parse dates and use more efficient sorting
    const withParsedDates = filtered.map(message => ({
      ...message,
      parsedDate: dayjs(message.date),
    }));

    withParsedDates.sort((a, b) => {
      const dateA = a.parsedDate;
      const dateB = b.parsedDate;

      if (!dateA.isValid() && !dateB.isValid()) return 0;
      if (!dateA.isValid()) return sortOrder === "newest" ? 1 : -1;
      if (!dateB.isValid()) return sortOrder === "newest" ? -1 : 1;

      const comparison = dateA.isAfter(dateB) ? 1 : dateA.isBefore(dateB) ? -1 : 0;
      return sortOrder === "newest" ? -comparison : comparison;
    });

    return withParsedDates;
  }, [messages, sortOrder, softDeletedUids]);
  
  const visibleMessages = sortedMessages.length;
  const softDeletedCount = softDeletedUids.size;
  const selectedCount = selectedMessageUids.size;
  const previewMessage = useMemo(
    () => (previewUid ? sortedMessages.find((message) => message.uid === previewUid) ?? null : null),
    [sortedMessages, previewUid]
  );
  useEffect(() => {
    resetAnalysisState();
  }, [previewMessage?.uid, resetAnalysisState]);
  const isBusy = isDeleting || deletingUids.size > 0 || isPurging;

  useEffect(() => {
    resetModalState();
  }, [sender, resetModalState]);

  useEffect(() => {
    if (messages.length === 0) {
      setPreviewUid(null);
      return;
    }
    setPreviewUid((current) => {
      if (current && sortedMessages.some((message) => message.uid === current)) {
        return current;
      }
      return sortedMessages[0]?.uid ?? null;
    });
  }, [messages, sortedMessages]);

  const handleToggleMessage = useCallback((uid: string) => {
    // Validate UID before toggling selection
    if (!validateUid(uid)) {
      setAnalysisError("Invalid message ID for selection");
      return;
    }
    toggleMessageSelection(uid);
  }, [toggleMessageSelection]);

  const handleToggleAll = useCallback(() => {
    if (sortedMessages.length === 0) {
      return;
    }
    toggleAllMessages(sortedMessages.map((message) => message.uid));
  }, [sortedMessages, toggleAllMessages]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDeleteSelected = useCallback(async () => {
    if (!sender || selectedMessageUids.size === 0 || isBusy) {
      return;
    }

    const uidsToDelete = Array.from(selectedMessageUids);
    // Validate all UIDs before proceeding
    if (!uidsToDelete.every(uid => validateUid(uid))) {
      setAnalysisError("Invalid message IDs detected");
      return;
    }

    const count = uidsToDelete.length;
    
    // Submit deletions to the background framework without waiting
    try {
      // Fire and forget - submit to deletion queue
      Promise.all(
        uidsToDelete.map(uid => 
          onDeleteMessage(sender.sender_email, uid, { suppressNotifications: true })
        )
      ).catch(error => {
        // eslint-disable-next-line no-console
        console.error("Failed to submit messages for deletion", error);
      });

      // Show success notification immediately
      notifySuccess(`${count} message${count > 1 ? 's' : ''} submitted for deletion`);
      
      // Close modal immediately - let the remote delete monitor show progress
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to submit messages for deletion", error);
      setAnalysisError("Failed to submit messages for deletion");
    }
  }, [isBusy, selectedMessageUids, sender, onDeleteMessage, notifySuccess, onClose]);

  const handlePurgeAll = useCallback(async () => {
    if (!sender || isPurging || isBusy) {
      return;
    }

    const senderEmail = sender.sender_email;
    const count = messages.length;
    
    try {
      // Submit purge to the background framework without waiting
      onPurgeSender(senderEmail).catch(error => {
        // eslint-disable-next-line no-console
        console.error("Failed to submit purge request", error);
      });

      // Show success notification immediately
      notifyInfo(`${count} message${count > 1 ? 's' : ''} from ${senderEmail} submitted for deletion`);
      
      // Close modal immediately - let the remote delete monitor show progress
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to submit purge request", error);
      setAnalysisError("Failed to submit purge request");
    }
  }, [isBusy, isPurging, onClose, onPurgeSender, sender, messages.length, notifyInfo]);

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
    if (!senderEmail || !validateEmail(senderEmail)) {
      setCopyError("Invalid email address");
      return;
    }

    try {
      await navigator.clipboard.writeText(senderEmail);
      setEmailCopied(true);
      setCopyError(null);
      if (copyResetTimeout.current) {
        window.clearTimeout(copyResetTimeout.current);
      }
      copyResetTimeout.current = window.setTimeout(() => {
        setEmailCopied(false);
        copyResetTimeout.current = null;
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to copy email";
      setCopyError(`Copy failed: ${errorMessage}`);
      setEmailCopied(false);
      // eslint-disable-next-line no-console
      console.error("Failed to copy sender email", error);
    }
  }, [senderEmail]);

  const handlePeekMessage = useCallback(
    (uid: string) => {
      if (isBusy) {
        return;
      }
      // Validate UID before setting preview
      if (!validateUid(uid)) {
        setAnalysisError("Invalid message ID for preview");
        return;
      }
      setPreviewUid(uid);
    },
    [isBusy, setPreviewUid]
  );

  const handleDeleteSingle = useCallback(
    async (uid: string) => {
      if (!sender || isBusy) {
        return;
      }
      if (deletingUids.has(uid)) {
        return;
      }

      // Validate UID before proceeding
      if (!validateUid(uid)) {
        setAnalysisError("Invalid message ID");
        return;
      }

      // Mark as soft-deleted immediately for better UX
      addSoftDeletedUid(uid);

      const nextPreviewCandidate = sortedMessages.find((message) => message.uid !== uid)?.uid ?? null;
      
      try {
        // Submit to deletion queue without waiting
        onDeleteMessage(sender.sender_email, uid, { suppressNotifications: true }).catch(error => {
          // eslint-disable-next-line no-console
          console.error("Failed to submit message for deletion", error);
        });

        // Update UI immediately
        setSelectedMessageUids((prev) => {
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
        setPreviewUid(nextPreviewCandidate);
        
        // Show subtle feedback
        notifySuccess("Message submitted for deletion");
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to submit message for deletion", error);
      }
    },
    [deletingUids, isBusy, sortedMessages, onDeleteMessage, sender, addSoftDeletedUid, notifySuccess]
  );

  const analyzePreviewMessage = useCallback(async () => {
    if (!previewMessage) {
      return;
    }

    const formatDate = (value?: string | null): string => {
      if (!value) return "";
      const parsed = dayjs(value);
      if (!parsed.isValid()) {
        return value; // Return original invalid value for debugging
      }
      return parsed.format("MMM D, YYYY h:mm A");
    };

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

    // Validate the prompt before sending to LLM
    if (!validateAnalysisPrompt(prompt)) {
      setAnalysisError("Invalid analysis prompt - contains potentially unsafe content");
      setIsAnalyzingMessage(false);
      return;
    }

    try {
      const response = await invoke<string>("analyze_with_llm", {
        prompt,
        max_tokens: 256
      });
      setLlmAnalysis(response?.trim() || "No analysis available");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setAnalysisError(`AI analysis failed: ${errorMessage}`);
      // eslint-disable-next-line no-console
      console.error("LLM analysis failed", error);
    } finally {
      setIsAnalyzingMessage(false);
    }
  }, [previewMessage, sender]);

  const title = sender ? `Messages from ${senderDisplay}` : "Messages";

  return (
    <MessageModalErrorBoundary>
            <Modal
        show={open}
        onHide={handleClose}
        size="xl"
        fullscreen
        centered
        backdrop={true}
        keyboard={true}
        dialogClassName="sender-messages-modal"
        contentClassName="sender-messages-modal-content"
        aria-labelledby="sender-messages-modal-title"
        aria-describedby="sender-messages-modal-description"
      >
        <Modal.Header closeButton className="sender-messages-modal-header">
          <Modal.Title id="sender-messages-modal-title">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span>{title}</span>
            {senderEmail && (
              <span style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <code style={{ padding: "2px 6px", borderRadius: "4px", background: "#f3f4f6" }}>{senderEmail}</code>
                  <BootstrapButton size="sm" variant={emailCopied ? "success" : copyError ? "danger" : "outline-secondary"} onClick={handleCopyEmail}>
                    {emailCopied ? "Copied" : copyError ? "Failed" : "Copy"}
                  </BootstrapButton>
                </span>
                {copyError && (
                  <span style={{ color: "#dc2626", fontSize: "0.8rem" }}>{copyError}</span>
                )}
              </span>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body 
        className="sender-messages-modal-body"
        id="sender-messages-modal-description"
      >
        {sender && totalMessages > 0 ? (
          <>
            <MessageToolbar
              allMessagesSelected={allMessagesSelected}
              selectedCount={selectedCount}
              sortOrder={sortOrder}
              isBusy={isBusy}
              totalMessages={totalMessages}
              onToggleAll={handleToggleAll}
              onSortOrderChange={setSortOrder}
            />
            <div className="sender-messages-body">
              {visibleMessages > 50 ? (
                <VirtualizedMessageList
                  messages={sortedMessages}
                  selectedMessageUids={selectedMessageUids}
                  deletingUids={deletingUids}
                  previewUid={previewUid}
                  isBusy={isBusy}
                  isDeleting={isDeleting}
                  onToggleMessage={handleToggleMessage}
                  onPeekMessage={handlePeekMessage}
                  onDeleteSingle={handleDeleteSingle}
                  containerHeight={400}
                />
              ) : (
                <MessageList
                  messages={sortedMessages}
                  selectedMessageUids={selectedMessageUids}
                  deletingUids={deletingUids}
                  previewUid={previewUid}
                  isBusy={isBusy}
                  isDeleting={isDeleting}
                  onToggleMessage={handleToggleMessage}
                  onPeekMessage={handlePeekMessage}
                  onDeleteSingle={handleDeleteSingle}
                />
              )}
              <div className="sender-message-preview">
                <MessagePreview
                  message={previewMessage}
                  llmAnalysis={llmAnalysis}
                  analysisError={analysisError}
                  isAnalyzingMessage={isAnalyzingMessage}
                  onAnalyzeMessage={analyzePreviewMessage}
                />
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
      <ModalFooter
        visibleMessages={visibleMessages}
        softDeletedCount={softDeletedCount}
        totalMessages={totalMessages}
        selectedCount={selectedCount}
        isBusy={isBusy}
        isDeleting={isDeleting}
        isPurging={isPurging}
        hasSender={!!sender}
        onClose={handleClose}
        onPurgeAll={handlePurgeAll}
        onDeleteSelected={handleDeleteSelected}
      />
    </Modal>
    </MessageModalErrorBoundary>
  );
}
