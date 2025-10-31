import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import type { BulkAnalysisRun, BulkAnalysisResult } from "../stores/bulkAnalysisStore";

interface BulkAnalysisPanelProps {
  isOpen: boolean;
  onClose: () => void;
  availableTags: string[];
  currentRun: BulkAnalysisRun | null;
  isStarting: boolean;
  lastError: string | null;
  lastRunTags: string[];
  onStart: (options: { tags: string[]; maxTokens?: number; snippetLimit?: number; force?: boolean }) => Promise<void>;
  activeTagFilter: string[];
  onToggleTagFilter: (tag: string) => void;
  onClearFilter: () => void;
  filteredMessageCount: number;
  onDeleteFiltered: () => Promise<void>;
  isDeletingFiltered: boolean;
  deleteProgress?: { completed: number; total: number; failed?: number } | null;
}

const PANEL_WIDTH = 380;
const MAX_DISPLAY_ITEMS = 10;

function formatDuration(durationMs?: number) {
  if (durationMs == null) return "";
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "";
  const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

function summarizeResult(result: BulkAnalysisResult) {
  const summary = result.summary?.trim();
  if (!summary) return "No summary provided";
  return summary.length > 140 ? `${summary.slice(0, 140)}…` : summary;
}

export default function BulkAnalysisPanel({
  isOpen,
  onClose,
  availableTags,
  currentRun,
  isStarting,
  lastError,
  lastRunTags,
  onStart,
  activeTagFilter,
  onToggleTagFilter,
  onClearFilter,
  filteredMessageCount,
  onDeleteFiltered,
  isDeletingFiltered,
  deleteProgress
}: BulkAnalysisPanelProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>(() => lastRunTags ?? []);
  const [maxTokens, setMaxTokens] = useState(512);
  const [snippetLimit, setSnippetLimit] = useState(2048);
  const [force, setForce] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setConfirmingDelete(false);
      setConfirmationText("");
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedTags((prev) => prev.filter((tag) => availableTags.includes(tag)));
  }, [availableTags]);

  useEffect(() => {
    setSelectedTags((prev) => {
      if (prev.length > 0) {
        return prev;
      }
      if (lastRunTags.length > 0) {
        return lastRunTags.filter((tag) => availableTags.includes(tag));
      }
      return availableTags.slice(0, 6);
    });
  }, [availableTags, lastRunTags]);

  const runStatusLabel = useMemo(() => {
    if (!currentRun) return "No active run";
    switch (currentRun.status) {
      case "starting":
        return "Preparing analysis";
      case "running":
        return "Analyzing mail";
      case "completed":
        return "Finished successfully";
      case "error":
        return currentRun.failed > 0 ? "Completed with errors" : "Error";
      default:
        return "";
    }
  }, [currentRun]);

  const progressPercent = useMemo(() => {
    if (!currentRun || currentRun.total === 0) return 0;
    const processed = currentRun.completed + currentRun.failed;
    return Math.min(100, Math.round((processed / currentRun.total) * 100));
  }, [currentRun]);

  const recentResults = useMemo(
    () => currentRun?.recentResults.slice(0, MAX_DISPLAY_ITEMS) ?? [],
    [currentRun]
  );

  const recentFailures = useMemo(
    () => currentRun?.failures.slice(0, MAX_DISPLAY_ITEMS) ?? [],
    [currentRun]
  );

  const handleSelectAll = () => setSelectedTags([...availableTags]);
  const handleClearSelected = () => setSelectedTags([]);
  const toggleSelectedTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const handleMaxTokensChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMaxTokens(Number.parseInt(event.target.value || "0", 10) || 0);
  };

  const handleSnippetLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSnippetLimit(Number.parseInt(event.target.value || "0", 10) || 0);
  };

  const handleStart = async () => {
    setLocalError(null);
    try {
      await onStart({ tags: selectedTags, maxTokens, snippetLimit, force });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteFiltered = async () => {
    try {
      await onDeleteFiltered();
    } finally {
      setConfirmingDelete(false);
      setConfirmationText("");
    }
  };

  const deleteDisabled = confirmationText.trim().toUpperCase() !== "DELETE" || isDeletingFiltered;

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    width: `${PANEL_WIDTH}px`,
    height: "100vh",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e5e7eb",
    boxShadow: "-4px 0 16px rgba(15, 23, 42, 0.14)",
    transform: isOpen ? "translateX(0)" : `translateX(${PANEL_WIDTH}px)`,
    transition: "transform 0.3s ease",
    zIndex: 2000,
    display: "flex",
    flexDirection: "column"
  };

  const sectionStyle: CSSProperties = {
    padding: "16px 20px",
    borderBottom: "1px solid #f3f4f6"
  };

  const toolbarButtonStyle: CSSProperties = {
    padding: "0.375rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    fontSize: "0.8rem"
  };

  return (
    <aside style={panelStyle}>
      <header
        style={{
          ...sectionStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div>
          <strong style={{ fontSize: "1rem" }}>Bulk AI analysis</strong>
          {currentRun && (
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{runStatusLabel}</div>
          )}
        </div>
        <ButtonComponent cssClass="ghost-button" content="✕" onClick={onClose} />
      </header>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <section style={sectionStyle}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Select tags to include</h3>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "12px" }}>
            The LLM will apply one or more of these tags to each analyzed message.
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button type="button" style={toolbarButtonStyle} onClick={handleSelectAll}>
              Select all
            </button>
            <button type="button" style={toolbarButtonStyle} onClick={handleClearSelected}>
              Clear
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "8px"
            }}
          >
            {availableTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <label
                  key={tag}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 6px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    backgroundColor: active ? "#eef2ff" : "#ffffff",
                    fontSize: "0.8rem"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleSelectedTag(tag)}
                  />
                  <span>{tag}</span>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#4b5563" }}>
              <span>Max completion tokens</span>
              <input
                type="number"
                min={64}
                max={2048}
                value={maxTokens}
                onChange={handleMaxTokensChange}
                style={{
                  width: "96px",
                  padding: "4px 6px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px"
                }}
              />
            </label>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "#4b5563" }}>
              <span>Snippet character limit</span>
              <input
                type="number"
                min={256}
                max={4096}
                value={snippetLimit}
                onChange={handleSnippetLimitChange}
                style={{
                  width: "96px",
                  padding: "4px 6px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px"
                }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#4b5563" }}>
              <input type="checkbox" checked={force} onChange={() => setForce((prev) => !prev)} />
              Re-run analysis even if messages already have tags
            </label>
          </div>

          {(localError || lastError) && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #fecaca",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                fontSize: "0.78rem"
              }}
            >
              {localError ?? lastError}
            </div>
          )}
        </section>

        <section style={sectionStyle}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "12px" }}>Run progress</h3>
          {currentRun ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>Status: {runStatusLabel}</div>
              <div
                style={{
                  height: "8px",
                  backgroundColor: "#e5e7eb",
                  borderRadius: "999px",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6)"
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", fontSize: "0.78rem", color: "#4b5563" }}>
                <span>Total: {currentRun.total}</span>
                <span>Completed: {currentRun.completed}</span>
                <span>Pending: {currentRun.pending}</span>
                <span>Failed: {currentRun.failed}</span>
              </div>
              {currentRun.startedAt && (
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Started {formatTimestamp(currentRun.startedAt)}</div>
              )}
              {currentRun.durationMs !== undefined && (
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Duration {formatDuration(currentRun.durationMs)}</div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>No analysis runs yet.</p>
          )}

          {recentResults.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <h4 style={{ fontSize: "0.8rem", color: "#4b5563", marginBottom: "6px" }}>Latest processed</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {recentResults.map((result) => (
                  <li
                    key={result.messageUid}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      padding: "8px",
                      backgroundColor: "#f9fafb",
                      fontSize: "0.78rem",
                      color: "#111827"
                    }}
                  >
                    <div style={{ marginBottom: "4px" }}>{summarizeResult(result)}</div>
                    {result.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {result.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: "2px 6px",
                              borderRadius: "999px",
                              backgroundColor: "#eef2ff",
                              color: "#3730a3",
                              fontSize: "0.7rem"
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recentFailures.length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <h4 style={{ fontSize: "0.8rem", color: "#b91c1c", marginBottom: "6px" }}>Recent failures</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                {recentFailures.map((failure, index) => (
                  <li
                    key={failure.messageUid ?? index}
                    style={{
                      border: "1px solid #fecaca",
                      borderRadius: "6px",
                      padding: "8px",
                      backgroundColor: "#fef2f2",
                      fontSize: "0.78rem",
                      color: "#991b1b"
                    }}
                  >
                    <div>{failure.error}</div>
                    {failure.stage && (
                      <div style={{ fontSize: "0.7rem", color: "#7f1d1d" }}>Stage: {failure.stage}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section style={sectionStyle}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "12px" }}>Active mailbox filters</h3>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "12px" }}>
            Select tags to filter the mailbox view. When active, only messages containing at least one
            selected tag will be displayed.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "8px",
              marginBottom: "12px"
            }}
          >
            {availableTags.map((tag) => {
              const active = activeTagFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTagFilter(tag)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    border: active ? "1px solid #6366f1" : "1px solid #d1d5db",
                    backgroundColor: active ? "#eef2ff" : "#ffffff",
                    color: active ? "#3730a3" : "#374151",
                    fontSize: "0.75rem",
                    cursor: "pointer"
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {activeTagFilter.length > 0 ? (
            <ButtonComponent cssClass="e-outline e-small" content="Clear filter" onClick={onClearFilter} />
          ) : (
            <p style={{ fontSize: "0.78rem", color: "#6b7280" }}>No tag filters applied.</p>
          )}
          <div style={{ marginTop: "12px", fontSize: "0.78rem", color: "#4b5563" }}>
            {activeTagFilter.length > 0
              ? `Filtering mailbox for ${activeTagFilter.join(", ")} (${filteredMessageCount} message${filteredMessageCount === 1 ? "" : "s"}).`
              : "Mailbox view currently shows all analyzed messages."}
          </div>

          {activeTagFilter.length > 0 && filteredMessageCount > 0 && !confirmingDelete && (
            <ButtonComponent
              cssClass="e-danger"
              content={`Delete ${filteredMessageCount} filtered message${filteredMessageCount === 1 ? "" : "s"}`}
              onClick={() => setConfirmingDelete(true)}
              style={{ marginTop: "12px" }}
            />
          )}

          {confirmingDelete && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                border: "1px solid #fca5a5",
                borderRadius: "8px",
                backgroundColor: "#fef2f2",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#7f1d1d", lineHeight: 1.4 }}>
                This will permanently delete {filteredMessageCount} message{filteredMessageCount === 1 ? "" : "s"} tagged with
                {" "}
                {activeTagFilter.join(", ")}. Type <strong>DELETE</strong> to confirm.
              </p>
              <input
                type="text"
                value={confirmationText}
                onChange={(event) => setConfirmationText(event.target.value)}
                placeholder="Type DELETE"
                style={{
                  padding: "6px 8px",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  fontSize: "0.8rem"
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <ButtonComponent
                  cssClass="e-outline e-small"
                  content="Cancel"
                  onClick={() => {
                    setConfirmingDelete(false);
                    setConfirmationText("");
                  }}
                  disabled={isDeletingFiltered}
                />
                <ButtonComponent
                  cssClass="e-danger"
                  content={isDeletingFiltered ? "Deleting…" : "Delete"}
                  disabled={deleteDisabled || isDeletingFiltered}
                  onClick={() => {
                    if (!deleteDisabled) {
                      setConfirmingDelete(false);
                      setConfirmationText("");
                      void handleDeleteFiltered();
                    }
                  }}
                />
              </div>
            </div>
          )}
        </section>
      </div>

      <footer style={{ ...sectionStyle, borderBottom: "none", borderTop: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <ButtonComponent
            cssClass="primary"
            content={isStarting ? "Starting…" : "Start analysis"}
            disabled={isStarting || selectedTags.length === 0}
            onClick={() => {
              void handleStart();
            }}
          />
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
            {selectedTags.length === 0
              ? "Select at least one tag to analyze."
              : `Selected ${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} for the next run.`}
          </div>
        </div>
      </footer>
    </aside>
  );
}
