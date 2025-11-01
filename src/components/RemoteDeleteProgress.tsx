interface RemoteDeleteTotals {
  total: number;
  pending: number;
  completed: number;
  failed: number;
}

interface RemoteDeleteProgressProps {
  totals: RemoteDeleteTotals;
  percent: number;
  summary: string;
}

function RemoteDeleteProgress({ totals, percent, summary }: RemoteDeleteProgressProps) {
  return (
    <div
      style={{
        padding: "12px 16px",
        backgroundColor: "#111827",
        color: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        borderBottom: "1px solid #1f2937"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          fontSize: "0.9rem"
        }}
      >
        Deleting messages from the server…
        <span style={{ fontSize: "0.85rem", opacity: 0.85 }}>
          {summary}
        </span>
      </div>
      <div
        style={{
          height: "6px",
          backgroundColor: "#1f2937",
          borderRadius: "999px",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${percent.toFixed(1)}%`,
            maxWidth: "100%",
            height: "100%",
            backgroundColor: "#34d399",
            transition: "width 150ms ease-out"
          }}
        />
      </div>
      {totals.failed > 0 && (
        <div style={{ fontSize: "0.8rem", color: "#fca5a5" }}>
          Some messages could not be removed remotely. Check the Deleted tab for details.
        </div>
      )}
    </div>
  );
}

export default RemoteDeleteProgress;