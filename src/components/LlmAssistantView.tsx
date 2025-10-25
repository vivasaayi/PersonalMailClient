import React, { useMemo } from "react";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { useLlmSettings } from "../hooks/useLlmSettings";
import LlmChatPanel from "./LlmChatPanel";

const formatBytes = (bytes: number | null | undefined) => {
  if (!bytes || bytes <= 0) {
    return "Unknown";
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
};

const statusLabel = (downloaded: boolean, active: boolean) => {
  if (active) {
    return "Active";
  }
  if (downloaded) {
    return "Downloaded";
  }
  return "Not downloaded";
};

export default function LlmAssistantView() {
  const {
    status,
    knownModels,
    busy,
    isChecking,
    isUpdatingPath,
    isLoadingModels,
    isDownloading,
    downloadingModelId,
    activatingModelId,
    downloadProgress,
    refreshStatus,
    refreshKnownModels,
    pickModelFile,
    clearModelPath,
    downloadModel,
    activateModel
  } = useLlmSettings();

  const statusIndicator = useMemo(() => {
    if (!status) {
      return { color: "#9ca3af", text: "Status unavailable" };
    }
    if (isChecking) {
      return { color: "#3b82f6", text: "Checking status ..." };
    }
    if (status.loaded) {
      return { color: "#16a34a", text: "Model loaded" };
    }
    if (status.configured_path) {
      return { color: "#f97316", text: "Configured, waiting to load" };
    }
    return { color: "#9ca3af", text: "Model not configured" };
  }, [isChecking, status]);

  const lastError = status?.last_error ?? null;
  const modelPath = status?.configured_path ?? "Not configured";

  return (
    <div style={{ flex: 1, overflow: "auto", backgroundColor: "#f9fafb" }}>
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "24px"
        }}
      >
        <header>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "1.5rem", fontWeight: 600 }}>Local AI Assistant</h2>
          <p style={{ margin: 0, color: "#4b5563", fontSize: "0.95rem" }}>
            Manage the on-device LLM used for message analysis and chat directly with it.
          </p>
        </header>

        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            backgroundColor: "#ffffff",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: statusIndicator.color
              }}
            />
            <span style={{ fontWeight: 600 }}>{statusIndicator.text}</span>
          </div>
          <div style={{ fontSize: "0.95rem", color: "#111827" }}>Model path: {modelPath}</div>
          {lastError && (
            <div style={{ fontSize: "0.85rem", color: "#dc2626" }}>Last error: {lastError}</div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <ButtonComponent
              content={isUpdatingPath ? "Updating ..." : "Choose Model File"}
              cssClass="outlined"
              disabled={busy}
              onClick={() => {
                void pickModelFile();
              }}
            />
            <ButtonComponent
              content="Clear Model"
              cssClass="outlined"
              disabled={busy || !status?.configured_path}
              onClick={() => {
                if (!status?.configured_path) return;
                if (window.confirm("Remove the configured model path?")) {
                  void clearModelPath();
                }
              }}
            />
            <ButtonComponent
              content={isChecking ? "Refreshing ..." : "Refresh Status"}
              cssClass="outlined"
              disabled={isChecking}
              onClick={() => {
                void refreshStatus();
              }}
            />
          </div>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
            Downloads save into the app data models folder. Larger models may take a minute to finish.
          </p>
        </section>

        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            backgroundColor: "#ffffff",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)"
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px"
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Model catalog</h3>
              <p style={{ margin: "4px 0 0", color: "#4b5563", fontSize: "0.9rem" }}>
                Download curated GGUF builds and switch between speed and quality based on your device.
              </p>
            </div>
            <ButtonComponent
              content={isLoadingModels ? "Refreshing ..." : "Refresh catalog"}
              cssClass="outlined"
              disabled={isLoadingModels || busy}
              onClick={() => {
                void refreshKnownModels();
              }}
            />
          </div>

          {isLoadingModels ? (
            <div style={{ color: "#4b5563", fontSize: "0.9rem" }}>Loading model metadata ...</div>
          ) : knownModels.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: "0.9rem" }}>
              No model presets are available right now. Try refreshing the catalog.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "16px"
              }}
            >
              {knownModels.map((model) => {
                const isActive = model.active;
                const isDownloaded = model.downloaded;
                const isDownloadingThis = downloadingModelId === model.id;
                const isActivatingThis = activatingModelId === model.id;
                const downloadOnlyLabel = isDownloadingThis
                  ? "Downloading ..."
                  : isDownloaded
                  ? "Redownload"
                  : "Download";
                const primaryLabel = isActive
                  ? "Active"
                  : isDownloaded
                  ? isActivatingThis
                    ? "Activating ..."
                    : "Set active"
                  : isDownloadingThis
                  ? "Downloading ..."
                  : "Download & use";

                return (
                  <div
                    key={model.id}
                    style={{
                      border: isActive ? "2px solid #2563eb" : "1px solid #e5e7eb",
                      borderRadius: "12px",
                      padding: "20px",
                      backgroundColor: isActive ? "#eff6ff" : "#ffffff",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      boxShadow: "0 6px 16px rgba(15, 23, 42, 0.05)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ fontWeight: 600, color: "#111827", fontSize: "1rem" }}>{model.name}</div>
                      {model.is_default && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "999px",
                            backgroundColor: "#dbeafe",
                            color: "#1d4ed8",
                            fontSize: "0.75rem",
                            fontWeight: 600
                          }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#4b5563", fontSize: "0.9rem", lineHeight: 1.5 }}>{model.description}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", color: "#4b5563" }}>
                      <span>Download size: ~{formatBytes(model.size_bytes)}</span>
                      {model.installed_size_bytes ? (
                        <span>Installed size: {formatBytes(model.installed_size_bytes)}</span>
                      ) : null}
                      <span>Context window: {model.context_length.toLocaleString()} tokens</span>
                      <span>Recommended: {model.recommended_ram_gb}+ GB RAM</span>
                      <span>Status: {statusLabel(isDownloaded, isActive)}</span>
                    </div>
                    <div style={{ color: "#6b7280", fontSize: "0.8rem", lineHeight: 1.5 }}>{model.notes}</div>
                    {isDownloadingThis && downloadProgress[model.id] && (
                      <div style={{ marginTop: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#4b5563", marginBottom: "4px" }}>
                          <span>Downloading...</span>
                          <span>{downloadProgress[model.id].progress}%</span>
                        </div>
                        <div style={{ width: "100%", height: "6px", backgroundColor: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${downloadProgress[model.id].progress}%`,
                              height: "100%",
                              backgroundColor: "#3b82f6",
                              transition: "width 0.3s ease"
                            }}
                          />
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "2px" }}>
                          {formatBytes(downloadProgress[model.id].downloaded)} / {formatBytes(downloadProgress[model.id].total)}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <ButtonComponent
                        cssClass="outlined"
                        content={downloadOnlyLabel}
                        disabled={busy || isDownloadingThis}
                        onClick={() => {
                          if (isDownloadingThis) return;
                          void downloadModel(model.id, false, isDownloaded);
                        }}
                      />
                      {isActive ? (
                        <ButtonComponent cssClass="outlined" content="Active" disabled />
                      ) : (
                        <ButtonComponent
                          cssClass="primary"
                          content={primaryLabel}
                          disabled={
                            busy ||
                            (isDownloaded ? isActivatingThis : isDownloadingThis)
                          }
                          onClick={() => {
                            if (!isDownloaded) {
                              if (isDownloadingThis) return;
                              void downloadModel(model.id, true);
                            } else {
                              if (isActivatingThis) return;
                              void activateModel(model.id, model.filename);
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <LlmChatPanel status={status ?? null} busy={busy} onRefreshStatus={refreshStatus} />
        </section>
      </div>
    </div>
  );
}
