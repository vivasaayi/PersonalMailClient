import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import type {
  RemoteDeleteMetricsResponse,
  RemoteDeleteOverrideMode
} from "../types";

interface RemoteDeleteMonitorProps {
  accountEmail: string;
  metrics: RemoteDeleteMetricsResponse | null;
  loading: boolean;
  progress: { pending: number; completed: number; failed: number } | null;
  onRefresh: () => Promise<void>;
  onChangeOverride: (mode: RemoteDeleteOverrideMode) => Promise<void>;
}

const HISTORY_WINDOW_MINUTES = 30;
type ChartPoint = { timestamp: number; value: number };
type HistoryEntry = RemoteDeleteMetricsResponse["history"][number];

const formatTimeLabel = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

export default function RemoteDeleteMonitor({
  accountEmail,
  metrics,
  loading,
  progress,
  onRefresh,
  onChangeOverride
}: RemoteDeleteMonitorProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);

  const normalizedEmail = accountEmail.trim().toLowerCase();
  const snapshot = metrics?.latest ?? null;
  const overrideMode: RemoteDeleteOverrideMode = snapshot?.override_mode ?? "auto";
  const nextMode: RemoteDeleteOverrideMode =
    overrideMode === "force-batch" ? "auto" : "force-batch";

  const queuePending = progress?.pending ?? snapshot?.pending ?? 0;
  const queueBacklog = snapshot?.total_pending ?? queuePending;
  const queueCompleted = progress?.completed ?? snapshot?.processed ?? 0;
  const queueFailed = progress?.failed ?? snapshot?.failed ?? 0;
  const lastUpdated = snapshot ? new Date(snapshot.timestamp * 1000) : null;
  const ratePerMinute = snapshot?.rate_per_minute ?? 0;
  const batchSize = snapshot?.batch_size ?? 0;
  const modeLabel = snapshot?.mode ?? "idle";

  useEffect(() => {
    if (!accountEmail) {
      return;
    }
    if (!metrics && !loading) {
      onRefresh().catch((err) => {
        console.error("Failed to refresh remote delete metrics", err);
      });
    }
  }, [accountEmail, loading, metrics, onRefresh]);

  const { chartPoints, pendingPoints } = useMemo(() => {
    if (!metrics) {
      return { chartPoints: [] as ChartPoint[], pendingPoints: [] as ChartPoint[] };
    }

    const now = Math.floor(Date.now() / 1000);
    const minuteNow = Math.floor(now / 60) * 60;
    const buckets = new Map<number, { processed: number; pending: number | null }>();

    for (const entry of metrics.history) {
      const bucketTs = Math.floor(entry.timestamp / 60) * 60;
      if (minuteNow - bucketTs > HISTORY_WINDOW_MINUTES * 60) {
        continue;
      }
      const bucket = buckets.get(bucketTs) ?? { processed: 0, pending: null };
      bucket.processed += entry.processed;
      bucket.pending = entry.pending;
      buckets.set(bucketTs, bucket);
    }

    const points: ChartPoint[] = [];
    const pendingSeries: ChartPoint[] = [];
    let lastPending = metrics.history.length > 0 ? metrics.history[0].pending : snapshot?.pending ?? 0;

    for (let offset = HISTORY_WINDOW_MINUTES - 1; offset >= 0; offset -= 1) {
      const bucketTs = minuteNow - offset * 60;
      const bucket = buckets.get(bucketTs);
      const processedValue = bucket?.processed ?? 0;
      const pendingValue = bucket?.pending ?? lastPending;
      points.push({ timestamp: bucketTs, value: processedValue });
      pendingSeries.push({ timestamp: bucketTs, value: pendingValue });
      if (bucket?.pending != null) {
        lastPending = bucket.pending;
      }
    }

    return { chartPoints: points, pendingPoints: pendingSeries };
  }, [metrics, snapshot?.pending]);

  const chartMax = useMemo(() => {
    if (chartPoints.length === 0) return 0;
    return chartPoints.reduce((max, point) => (point.value > max ? point.value : max), 0);
  }, [chartPoints]);

  const pendingMax = useMemo(() => {
    if (pendingPoints.length === 0) return 0;
    return pendingPoints.reduce((max, point) => (point.value > max ? point.value : max), 0);
  }, [pendingPoints]);

  const chartLabels = useMemo(() => {
    if (chartPoints.length === 0) return [] as Array<{ key: string; label: string }>;
    const first = chartPoints[0];
    const middle = chartPoints[Math.floor(chartPoints.length / 2)];
    const last = chartPoints[chartPoints.length - 1];
    return [
      { key: "start", label: formatTimeLabel(first.timestamp) },
      { key: "middle", label: formatTimeLabel(middle.timestamp) },
      { key: "end", label: formatTimeLabel(last.timestamp) }
    ];
  }, [chartPoints]);

  const recentEvents = useMemo<HistoryEntry[]>(() => {
    if (!metrics) return [];
    return metrics.history.slice(-8).reverse();
  }, [metrics]);

  const handleRefreshClick = useCallback(async () => {
    if (loading || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (err) {
      console.error("Remote delete refresh failed", err);
    } finally {
      setRefreshing(false);
    }
  }, [loading, onRefresh, refreshing]);

  const handleToggleOverride = useCallback(async () => {
    if (updatingMode || loading) return;
    setUpdatingMode(true);
    try {
      await onChangeOverride(nextMode);
    } catch (err) {
      console.error("Failed to change remote delete override", err);
    } finally {
      setUpdatingMode(false);
    }
  }, [loading, nextMode, onChangeOverride, updatingMode]);

  const statsGrid = createElement(
    "div",
    {
      key: "stats-grid",
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "16px",
        marginTop: "24px"
      }
    },
    [
      createStatCard("pending", "Pending queue", queuePending.toLocaleString(), "Awaiting server confirmation", "#2563eb"),
      createStatCard(
        "backlog",
        "Remaining backlog",
        queueBacklog.toLocaleString(),
        "Queued + unclaimed in DB",
        "#0891b2"
      ),
      createStatCard(
        "completed",
        "Completed (session)",
        queueCompleted.toLocaleString(),
        "Since last app launch",
        "#059669"
      ),
      createStatCard(
        "failed",
        "Failed (session)",
        queueFailed.toLocaleString(),
        queueFailed > 0 ? "Check error list below" : "None recorded",
        queueFailed > 0 ? "#d97706" : "#6b7280"
      ),
      createStatCard(
        "rate",
        "Current throughput",
        `${ratePerMinute.toFixed(1)} / min`,
        batchSize > 1 ? `Batch size ${batchSize}` : "Single-message fallback",
        "#7c3aed"
      ),
      createStatCard(
        "mode",
        "Processing mode",
        overrideMode === "force-batch" ? "Forced batch" : "Adaptive auto",
        `Latest run: ${modeLabel}`,
        overrideMode === "force-batch" ? "#dc2626" : "#0ea5e9"
      )
    ]
  );

  const chartSection = createElement(
    "section",
    {
      key: "chart-section",
      style: { marginTop: "32px" }
    },
    [
      createElement(
        "h3",
        {
          key: "chart-title",
          style: { margin: "0 0 8px 0", fontSize: "1.125rem" }
        },
        `Deletions per minute · last ${HISTORY_WINDOW_MINUTES} minutes`
      ),
      chartPoints.length === 0
        ? createElement(
            "p",
            {
              key: "chart-empty",
              style: { margin: 0, color: "#6b7280" }
            },
            "No remote delete activity recorded yet."
          )
        : createElement(
            "div",
            {
              key: "chart",
              style: {
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: "12px",
                backgroundColor: "#f9fafb"
              }
            },
            [
              createElement(
                "div",
                {
                  key: "bars",
                  style: {
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "4px",
                    height: "120px",
                    marginBottom: "8px"
                  }
                },
                chartPoints.map((point) => {
                  const percentage = chartMax === 0 ? 0 : (point.value / chartMax) * 100;
                  const height = chartMax === 0 ? 0 : Math.max(4, percentage);
                  return createElement("div", {
                    key: point.timestamp,
                    title: `${formatTimeLabel(point.timestamp)} · ${point.value} messages`,
                    style: {
                      flex: 1,
                      minWidth: "4px",
                      borderRadius: "4px 4px 0 0",
                      backgroundColor: point.value > 0 ? "#2563eb" : "#d1d5db",
                      height: `${height}%`
                    }
                  });
                })
              ),
              createElement(
                "div",
                {
                  key: "chart-labels",
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "#6b7280"
                  }
                },
                chartLabels.map((item) =>
                  createElement(
                    "span",
                    { key: item.key },
                    item.label
                  )
                )
              )
            ]
          )
    ]
  );

  const pendingChartSection = createElement(
    "section",
    {
      key: "pending-chart-section",
      style: { marginTop: "24px" }
    },
    [
      createElement(
        "h3",
        {
          key: "pending-chart-title",
          style: { margin: "0 0 8px 0", fontSize: "1.125rem" }
        },
        `Pending queue · last ${HISTORY_WINDOW_MINUTES} minutes`
      ),
      pendingPoints.length === 0
        ? createElement(
            "p",
            {
              key: "pending-empty",
              style: { margin: 0, color: "#6b7280" }
            },
            "No pending queue data recorded yet."
          )
        : createElement(
            "div",
            {
              key: "pending-chart",
              style: {
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                padding: "12px",
                backgroundColor: "#f9fafb"
              }
            },
            [
              createElement(
                "div",
                {
                  key: "pending-line",
                  style: {
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "4px",
                    height: "120px",
                    marginBottom: "8px"
                  }
                },
                pendingPoints.map((point) => {
                  const percentage = pendingMax === 0 ? 0 : (point.value / pendingMax) * 100;
                  const height = pendingMax === 0 ? 0 : Math.max(2, percentage);
                  return createElement("div", {
                    key: point.timestamp,
                    title: `${formatTimeLabel(point.timestamp)} · ${point.value} pending`,
                    style: {
                      flex: 1,
                      minWidth: "4px",
                      borderRadius: "4px 4px 0 0",
                      backgroundColor: "#0ea5e9",
                      height: `${height}%`
                    }
                  });
                })
              ),
              createElement(
                "div",
                {
                  key: "pending-chart-labels",
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "#6b7280"
                  }
                },
                chartLabels.map((item) =>
                  createElement(
                    "span",
                    { key: item.key },
                    item.label
                  )
                )
              )
            ]
          )
    ]
  );

  const eventsSection = createElement(
    "section",
    {
      key: "events-section",
      style: { marginTop: "32px" }
    },
    [
      createElement(
        "h3",
        {
          key: "events-title",
          style: { margin: "0 0 8px 0", fontSize: "1.125rem" }
        },
        "Recent batches"
      ),
      recentEvents.length === 0
        ? createElement(
            "p",
            {
              key: "events-empty",
              style: { margin: 0, color: "#6b7280" }
            },
            "No batch history yet."
          )
        : createElement(
            "div",
            {
              key: "table-wrapper",
              style: {
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden"
              }
            },
            [
              createElement(
                "table",
                {
                  key: "table",
                  style: {
                    width: "100%",
                    borderCollapse: "collapse"
                  }
                },
                [
                  createElement(
                    "thead",
                    { key: "thead", style: { backgroundColor: "#f9fafb" } },
                    createElement(
                      "tr",
                      { key: "head-row" },
                      ["Time", "Processed", "Pending", "Mode"].map((header) =>
                        createElement(
                          "th",
                          {
                            key: header,
                            style: {
                              textAlign: "left",
                              padding: "8px 12px",
                              fontSize: "0.75rem",
                              color: "#6b7280",
                              fontWeight: 600,
                              borderBottom: "1px solid #e5e7eb"
                            }
                          },
                          header
                        )
                      )
                    )
                  ),
                  createElement(
                    "tbody",
                    { key: "tbody" },
                    recentEvents.map((event) =>
                      createElement(
                        "tr",
                        {
                          key: event.timestamp,
                          style: {
                            borderBottom: "1px solid #f3f4f6"
                          }
                        },
                        [
                          createElement(
                            "td",
                            {
                              key: "time",
                              style: { padding: "8px 12px", fontSize: "0.8125rem" }
                            },
                            formatTimeLabel(event.timestamp)
                          ),
                          createElement(
                            "td",
                            {
                              key: "processed",
                              style: {
                                padding: "8px 12px",
                                fontSize: "0.8125rem"
                              }
                            },
                            event.processed.toLocaleString()
                          ),
                          createElement(
                            "td",
                            {
                              key: "pending",
                              style: {
                                padding: "8px 12px",
                                fontSize: "0.8125rem"
                              }
                            },
                            event.pending.toLocaleString()
                          ),
                          createElement(
                            "td",
                            {
                              key: "mode",
                              style: { padding: "8px 12px", fontSize: "0.8125rem" }
                            },
                            event.mode
                          )
                        ]
                      )
                    )
                  )
                ]
              )
            ]
          )
    ]
  );

  return createElement(
    "div",
    {
      style: {
        padding: "24px",
        width: "100%",
        height: "100%",
        overflowY: "auto",
        backgroundColor: "#f8fafc"
      }
    },
    [
      createElement(
        "div",
        {
          key: "header",
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px"
          }
        },
        [
          createElement(
            "div",
            { key: "titles" },
            [
              createElement(
                "h2",
                {
                  key: "heading",
                  style: {
                    margin: "0 0 4px 0",
                    fontSize: "1.5rem",
                    fontWeight: 600
                  }
                },
                "Remote Delete Monitor"
              ),
              createElement(
                "p",
                {
                  key: "subtitle",
                  style: {
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "#4b5563"
                  }
                },
                `Observing ${normalizedEmail}`
              ),
              lastUpdated &&
                createElement(
                  "p",
                  {
                    key: "last-updated",
                    style: {
                      margin: "8px 0 0 0",
                      fontSize: "0.75rem",
                      color: "#6b7280"
                    }
                  },
                  `Last update ${lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}`
                ),
              !snapshot && loading &&
                createElement(
                  "p",
                  {
                    key: "initial-loading",
                    style: { margin: "8px 0 0 0", fontSize: "0.75rem", color: "#6b7280" }
                  },
                  "Loading remote delete metrics…"
                )
            ].filter(Boolean)
          ),
          createElement(
            "div",
            {
              key: "actions",
              style: {
                display: "flex",
                gap: "8px"
              }
            },
            [
              createElement(
                "button",
                {
                  key: "refresh",
                  onClick: handleRefreshClick,
                  disabled: loading || refreshing,
                  style: {
                    padding: "8px 16px",
                    border: "1px solid #2563eb",
                    borderRadius: "6px",
                    backgroundColor: loading || refreshing ? "#bfdbfe" : "#2563eb",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: loading || refreshing ? "not-allowed" : "pointer"
                  }
                },
                refreshing ? "Refreshing…" : "Refresh"
              ),
              createElement(
                "button",
                {
                  key: "toggle",
                  onClick: handleToggleOverride,
                  disabled: updatingMode || loading,
                  style: {
                    padding: "8px 16px",
                    border: "1px solid #dc2626",
                    borderRadius: "6px",
                    backgroundColor: overrideMode === "force-batch" ? "#dc2626" : "#f87171",
                    color: "#ffffff",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: updatingMode ? "not-allowed" : "pointer"
                  }
                },
                updatingMode
                  ? "Updating…"
                  : overrideMode === "force-batch"
                  ? "Return to auto mode"
                  : "Force batch mode"
              )
            ]
          )
        ]
      ),
      createElement(
        "p",
        {
          key: "queue-summary",
          style: {
            margin: "16px 0 0 0",
            fontSize: "0.875rem",
            color: "#374151"
          }
        },
        `Queue snapshot · ${queuePending.toLocaleString()} pending · ${queueCompleted.toLocaleString()} completed · ${queueFailed.toLocaleString()} failed`
      ),
      statsGrid,
      chartSection,
      pendingChartSection,
      eventsSection
    ]
  );
}

function createStatCard(
  key: string,
  label: string,
  value: string,
  subtitle: string,
  accentColor: string
) {
  return createElement(
    "div",
    {
      key,
      style: {
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "16px",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)"
      }
    },
    [
      createElement(
        "div",
        {
          key: "label",
          style: {
            fontSize: "0.75rem",
            textTransform: "uppercase",
            color: accentColor,
            fontWeight: 600,
            marginBottom: "8px"
          }
        },
        label
      ),
      createElement(
        "div",
        {
          key: "value",
          style: {
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#111827"
          }
        },
        value
      ),
      createElement(
        "div",
        {
          key: "subtitle",
          style: {
            marginTop: "8px",
            fontSize: "0.8125rem",
            color: "#6b7280"
          }
        },
        subtitle
      )
    ]
  );
}
