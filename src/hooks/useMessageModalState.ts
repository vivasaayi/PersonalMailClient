import { useState, useMemo } from "react";

type SortOrder = "newest" | "oldest";

interface MessageModalState {
  // Selection state
  selectedMessageUids: Set<string>;
  allMessagesSelected: boolean;

  // UI state
  previewUid: string | null;
  sortOrder: SortOrder;
  emailCopied: boolean;
  copyError: string | null;

  // Operation state
  isDeleting: boolean;
  deletingUids: Set<string>;
  isPurging: boolean;
  isAnalyzingMessage: boolean;
  softDeletedUids: Set<string>;

  // Analysis state
  llmAnalysis: string | null;
  analysisError: string | null;
}

interface MessageModalActions {
  // Selection actions
  setSelectedMessageUids: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  toggleMessageSelection: (uid: string) => void;
  toggleAllMessages: (allUids: string[]) => void;
  clearSelection: () => void;

  // UI actions
  setPreviewUid: (value: string | null | ((prev: string | null) => string | null)) => void;
  setSortOrder: (order: SortOrder) => void;
  setEmailCopied: (copied: boolean) => void;
  setCopyError: (error: string | null) => void;

  // Operation actions
  setIsDeleting: (deleting: boolean) => void;
  setDeletingUids: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  addDeletingUid: (uid: string) => void;
  removeDeletingUid: (uid: string) => void;
  setIsPurging: (purging: boolean) => void;
  setIsAnalyzingMessage: (analyzing: boolean) => void;
  addSoftDeletedUid: (uid: string) => void;

  // Analysis actions
  setLlmAnalysis: (analysis: string | null) => void;
  setAnalysisError: (error: string | null) => void;

  // Reset actions
  resetModalState: () => void;
  resetAnalysisState: () => void;
}

export function useMessageModalState(totalMessages: number): MessageModalState & MessageModalActions {
  const [selectedMessageUids, setSelectedMessageUids] = useState<Set<string>>(new Set());
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [emailCopied, setEmailCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingUids, setDeletingUids] = useState<Set<string>>(new Set());
  const [isPurging, setIsPurging] = useState(false);
  const [isAnalyzingMessage, setIsAnalyzingMessage] = useState(false);
  const [softDeletedUids, setSoftDeletedUids] = useState<Set<string>>(new Set());
  const [llmAnalysis, setLlmAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const allMessagesSelected = useMemo(() => {
    return totalMessages > 0 && selectedMessageUids.size === totalMessages;
  }, [selectedMessageUids.size, totalMessages]);

  const toggleMessageSelection = (uid: string) => {
    setSelectedMessageUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  const toggleAllMessages = (allUids: string[]) => {
    setSelectedMessageUids(prev => {
      const isAllSelected = allUids.every(uid => prev.has(uid));
      return isAllSelected ? new Set() : new Set(allUids);
    });
  };

  const clearSelection = () => {
    setSelectedMessageUids(new Set());
  };

  const addDeletingUid = (uid: string) => {
    setDeletingUids(prev => new Set([...prev, uid]));
  };

  const removeDeletingUid = (uid: string) => {
    setDeletingUids(prev => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  };

  const addSoftDeletedUid = (uid: string) => {
    setSoftDeletedUids(prev => new Set([...prev, uid]));
  };

  const resetModalState = () => {
    setSelectedMessageUids(new Set());
    setIsDeleting(false);
    setPreviewUid(null);
    setDeletingUids(new Set());
    setLlmAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzingMessage(false);
    setIsPurging(false);
    setSoftDeletedUids(new Set());
  };

  const resetAnalysisState = () => {
    setLlmAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzingMessage(false);
  };

  return {
    // State
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

    // Actions
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
  };
}