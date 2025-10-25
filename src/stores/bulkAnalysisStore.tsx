import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useNotifications } from "./notifications";

const DEFAULT_TAGS = [
  "personal",
  "work",
  "finance",
  "travel",
  "health",
  "education",
  "shopping",
  "news",
  "alerts",
  "notifications",
  "marketing",
  "social",
  "system",
  "legal",
  "support-request",
  "shipping",
  "event"
];

export type BulkRunStatus = "idle" | "starting" | "running" | "completed" | "error";

export interface BulkAnalysisResult {
  accountEmail: string;
  messageUid: string;
  summary?: string | null;
  sentiment?: string | null;
  tags: string[];
  confidence?: number | null;
  timestamp?: number;
}

export interface BulkAnalysisFailure {
  accountEmail?: string;
  messageUid?: string;
  stage?: string;
  error: string;
  timestamp?: number;
}

export interface BulkAnalysisRun {
  runId: string;
  status: BulkRunStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  pending: number;
  accounts: string[];
  modelId?: string | null;
  validatorModelId?: string | null;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  lastUpdatedAt?: number;
  lastError?: string | null;
  recentResults: BulkAnalysisResult[];
  failures: BulkAnalysisFailure[];
}

export interface StartBulkAnalysisOptions {
  tags: string[];
  maxTokens?: number;
  snippetLimit?: number;
  force?: boolean;
  modelId?: string | null;
  validatorModelId?: string | null;
}

interface BulkAnalysisContextValue {
  availableTags: string[];
  activeTagFilter: string[];
  currentRun: BulkAnalysisRun | null;
  isPanelOpen: boolean;
  isStarting: boolean;
  lastError: string | null;
  lastRunTags: string[];
  startAnalysis: (options: StartBulkAnalysisOptions) => Promise<string>;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setActiveTagFilter: (tags: string[]) => void;
  toggleTagFilter: (tag: string) => void;
  clearTagFilter: () => void;
  addKnownTags: (tags: string[]) => void;
  resetCurrentRun: () => void;
}

interface BulkProgressPayload {
  runId: string;
  status: "starting" | "processed" | "error" | "completed";
  total?: number;
  completed?: number;
  failed?: number;
  skipped?: number;
  pending?: number;
  accounts?: string[];
  modelId?: string | null;
  validatorModelId?: string | null;
  timestamp?: number;
  durationMs?: number;
  stage?: string;
  error?: string;
  accountEmail?: string;
  messageUid?: string;
  force?: boolean;
  result?: {
    summary?: string | null;
    sentiment?: string | null;
    tags?: string[];
    confidence?: number | null;
    metadata?: unknown;
  } | null;
}

const BulkAnalysisContext = createContext<BulkAnalysisContextValue | undefined>(undefined);

function createInitialRun(payload: BulkProgressPayload): BulkAnalysisRun {
  const timestamp = payload.timestamp ?? Date.now();
  const total = payload.total ?? 0;
  const completed = payload.completed ?? 0;
  const failed = payload.failed ?? 0;
  const pending = payload.pending ?? Math.max(total - completed - failed, 0);

  const baseStatus: BulkRunStatus =
    payload.status === "completed"
      ? failed > 0
        ? "error"
        : "completed"
      : payload.status === "starting"
      ? "starting"
      : "running";

  return {
    runId: payload.runId,
    status: baseStatus,
    total,
    completed,
    failed,
    skipped: payload.skipped ?? 0,
    pending,
    accounts: payload.accounts ?? [],
    modelId: payload.modelId ?? null,
    validatorModelId: payload.validatorModelId ?? null,
    startedAt: timestamp,
    completedAt: payload.status === "completed" ? timestamp : undefined,
    durationMs: payload.status === "completed" ? payload.durationMs : undefined,
    lastUpdatedAt: timestamp,
    lastError: payload.status === "error" ? payload.error ?? "Unknown error" : null,
    recentResults: [],
    failures: payload.status === "error" && payload.error
      ? [
          {
            accountEmail: payload.accountEmail,
            messageUid: payload.messageUid,
            stage: payload.stage,
            error: payload.error,
            timestamp
          }
        ]
      : []
  };
}

function mergeTags(existing: string[], next: string[]): string[] {
  const set = new Set(existing.map((tag) => tag.trim().toLowerCase()));
  let changed = false;
  next.forEach((tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!set.has(lower)) {
      set.add(lower);
      changed = true;
    }
  });
  if (!changed) {
    return existing;
  }
  const normalized = Array.from(set).map((tag) => tag);
  normalized.sort((a, b) => a.localeCompare(b));
  return normalized;
}

export function BulkAnalysisProvider({ children }: { children: ReactNode }) {
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const [availableTags, setAvailableTags] = useState<string[]>(() => {
    const sorted = [...DEFAULT_TAGS];
    sorted.sort((a, b) => a.localeCompare(b));
    return sorted;
  });
  const [activeTagFilter, setActiveTagFilter] = useState<string[]>([]);
  const [currentRun, setCurrentRun] = useState<BulkAnalysisRun | null>(null);
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastRunTags, setLastRunTags] = useState<string[]>(DEFAULT_TAGS);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const addKnownTags = useCallback((tags: string[]) => {
    setAvailableTags((prev) => mergeTags(prev, tags));
  }, []);

  const resetCurrentRun = useCallback(() => {
    setCurrentRun(null);
    setLastError(null);
  }, []);

  const updateRunFromPayload = useCallback(
    (payload: BulkProgressPayload) => {
      if (!payload.runId) {
        return;
      }

      setCurrentRun((prev) => {
        let next = prev && prev.runId === payload.runId ? { ...prev } : createInitialRun(payload);

        if (prev && prev.runId === payload.runId) {
          next = {
            ...prev,
            status: prev.status,
            total: prev.total,
            completed: prev.completed,
            failed: prev.failed,
            skipped: prev.skipped,
            pending: prev.pending,
            accounts: prev.accounts,
            modelId: prev.modelId,
            validatorModelId: prev.validatorModelId,
            startedAt: prev.startedAt,
            completedAt: prev.completedAt,
            durationMs: prev.durationMs,
            lastUpdatedAt: prev.lastUpdatedAt,
            lastError: prev.lastError ?? null,
            recentResults: [...prev.recentResults],
            failures: [...prev.failures]
          };
        }

        const timestamp = payload.timestamp ?? Date.now();
        if (payload.total !== undefined) next.total = payload.total;
        if (payload.completed !== undefined) next.completed = payload.completed;
        if (payload.failed !== undefined) next.failed = payload.failed;
        if (payload.skipped !== undefined) next.skipped = payload.skipped;
        if (payload.pending !== undefined) {
          next.pending = payload.pending;
        } else {
          next.pending = Math.max(next.total - next.completed - next.failed, 0);
        }
        if (payload.accounts) next.accounts = payload.accounts;
        if (payload.modelId !== undefined) next.modelId = payload.modelId;
        if (payload.validatorModelId !== undefined) next.validatorModelId = payload.validatorModelId;
        next.lastUpdatedAt = timestamp;

        switch (payload.status) {
          case "starting":
            next.status = "running";
            next.startedAt = next.startedAt ?? timestamp;
            break;
          case "processed": {
            next.status = "running";
            const tags = payload.result?.tags ?? [];
            if (tags.length > 0) {
              addKnownTags(tags);
            }
            const result: BulkAnalysisResult = {
              accountEmail: payload.accountEmail ?? "",
              messageUid: payload.messageUid ?? "",
              summary: payload.result?.summary,
              sentiment: payload.result?.sentiment,
              tags,
              confidence: payload.result?.confidence,
              timestamp
            };
            next.recentResults = [result, ...next.recentResults].slice(0, 50);
            break;
          }
          case "error": {
            next.status = "running";
            const failure: BulkAnalysisFailure = {
              accountEmail: payload.accountEmail,
              messageUid: payload.messageUid,
              stage: payload.stage,
              error: payload.error ?? "Unknown error",
              timestamp
            };
            next.failures = [failure, ...next.failures].slice(0, 50);
            next.lastError = failure.error;
            break;
          }
          case "completed": {
            next.status = next.failed > 0 ? "error" : "completed";
            next.completedAt = timestamp;
            next.durationMs = payload.durationMs ?? (next.startedAt ? timestamp - next.startedAt : undefined);
            break;
          }
          default:
            break;
        }

        return next;
      });
    },
    [addKnownTags]
  );

  useEffect(() => {
    let mounted = true;
    const register = async () => {
      try {
        const unlisten = await listen<BulkProgressPayload>("llm-bulk-analysis-progress", (event) => {
          if (!mounted || !event.payload) return;
          const payload = event.payload;

          if (payload.status === "starting") {
            notifyInfo("Bulk analysis started.");
          }

          if (payload.status === "error" && payload.error) {
            setLastError(payload.error);
            notifyError(`Bulk analysis error: ${payload.error}`);
          }

          if (payload.status === "completed") {
            if ((payload.failed ?? 0) > 0) {
              notifyError("Bulk analysis completed with errors.");
            } else {
              notifySuccess("Bulk analysis completed.");
            }
          }

          if (payload.result?.tags?.length) {
            addKnownTags(payload.result.tags);
          }

          updateRunFromPayload(payload);
        });
        unlistenRef.current = unlisten;
      } catch (err) {
        console.error("Failed to register bulk analysis listener", err);
      }
    };

    register().catch((err) => {
      console.error("Failed to initialize bulk analysis listener", err);
    });

    return () => {
      mounted = false;
      const unlisten = unlistenRef.current;
      if (unlisten) {
        unlisten();
        unlistenRef.current = null;
      }
    };
  }, [addKnownTags, notifyError, notifyInfo, notifySuccess, updateRunFromPayload]);

  const startAnalysis = useCallback(
    async ({ tags, maxTokens, snippetLimit, force, modelId, validatorModelId }: StartBulkAnalysisOptions) => {
      const normalized = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
      if (normalized.length === 0) {
        throw new Error("Select at least one tag to analyze.");
      }

      setIsStarting(true);
      setLastError(null);

      try {
        const runId = await invoke<string>("start_bulk_analysis", {
          allowed_tags: normalized,
          max_tokens: maxTokens,
          snippet_limit: snippetLimit,
          force,
          model_id: modelId ?? null,
          validator_model_id: validatorModelId ?? null
        });

        const timestamp = Date.now();
        setCurrentRun({
          runId,
          status: "starting",
          total: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
          pending: 0,
          accounts: [],
          modelId: modelId ?? null,
          validatorModelId: validatorModelId ?? null,
          startedAt: timestamp,
          lastUpdatedAt: timestamp,
          lastError: null,
          recentResults: [],
          failures: []
        });
        setLastRunTags(normalized);
        setPanelOpen(true);
        notifyInfo("Requested bulk analysis run.");
        return runId;
      } finally {
        setIsStarting(false);
      }
    },
    [notifyInfo]
  );

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  const toggleTagFilter = useCallback((tag: string) => {
    setActiveTagFilter((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      return [...prev, tag];
    });
  }, []);

  const clearTagFilter = useCallback(() => {
    setActiveTagFilter([]);
  }, []);

  const value = useMemo<BulkAnalysisContextValue>(() => ({
    availableTags,
    activeTagFilter,
    currentRun,
    isPanelOpen,
    isStarting,
    lastError,
    lastRunTags,
    startAnalysis,
    setPanelOpen,
    togglePanel,
    setActiveTagFilter,
    toggleTagFilter,
    clearTagFilter,
    addKnownTags,
    resetCurrentRun
  }), [
    availableTags,
    activeTagFilter,
    currentRun,
    isPanelOpen,
    isStarting,
    lastError,
    lastRunTags,
    startAnalysis,
    togglePanel,
    toggleTagFilter,
    clearTagFilter,
    addKnownTags,
    resetCurrentRun
  ]);

  return <BulkAnalysisContext.Provider value={value}>{children}</BulkAnalysisContext.Provider>;
}

export function useBulkAnalysis(): BulkAnalysisContextValue {
  const context = useContext(BulkAnalysisContext);
  if (!context) {
    throw new Error("useBulkAnalysis must be used within a BulkAnalysisProvider");
  }
  return context;
}
