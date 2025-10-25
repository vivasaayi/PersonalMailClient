import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/api/dialog";
import type { KnownLlmModel, LlmStatus } from "../types";
import { useNotifications } from "../stores/notifications";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const DEFAULT_MODEL_ID = "tinyllama-1.1b-q4";

export function useLlmSettings() {
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdatingPath, setIsUpdatingPath] = useState(false);
  const [knownModels, setKnownModels] = useState<KnownLlmModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [activatingModelId, setActivatingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { downloaded: number; total: number; progress: number }>>({});

  const refreshStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await invoke<LlmStatus>("get_llm_status");
      setStatus(result);
    } catch (err) {
      console.error(err);
      notifyError(`Failed to query LLM status: ${errorMessage(err)}`);
    } finally {
      setIsChecking(false);
    }
  }, [notifyError]);

  const refreshKnownModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const result = await invoke<KnownLlmModel[]>("list_known_llm_models");
      setKnownModels(result);
    } catch (err) {
      console.error(err);
      notifyError(`Failed to load model catalog: ${errorMessage(err)}`);
    } finally {
      setIsLoadingModels(false);
    }
  }, [notifyError]);

  useEffect(() => {
    refreshStatus().catch((err) => {
      console.error("Failed to refresh LLM status on mount", err);
    });
  }, [refreshStatus]);

  useEffect(() => {
    refreshKnownModels().catch((err) => {
      console.error("Failed to load LLM model catalog on mount", err);
    });
  }, [refreshKnownModels]);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen("model-download-progress", (event) => {
      const payload = event.payload as { model_id: string; downloaded: number; total: number; progress: number };
      setDownloadProgress(prev => ({
        ...prev,
        [payload.model_id]: {
          downloaded: payload.downloaded,
          total: payload.total,
          progress: payload.progress
        }
      }));
    });

    return () => {
      unlisten.then(fn => fn()).catch(console.error);
    };
  }, []);

  const pickModelFile = useCallback(async () => {
    try {
      const selected = await open({
        title: "Select GGUF model",
        multiple: false,
        directory: false,
        filters: [{ name: "GGUF Models", extensions: ["gguf"] }]
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      setIsUpdatingPath(true);
      const result = await invoke<LlmStatus>("set_llm_model_path", { path: selected });
      setStatus(result);
      await refreshKnownModels();

      if (result.loaded) {
        notifySuccess("Local LLM loaded successfully.");
      } else if (result.configured_path) {
        notifyInfo("Model path saved. Loading will happen on first use.");
      } else {
        notifyInfo("Model path cleared.");
      }
    } catch (err) {
      console.error(err);
      notifyError(`Failed to set model path: ${errorMessage(err)}`);
    } finally {
      setIsUpdatingPath(false);
    }
  }, [notifyError, notifyInfo, notifySuccess, refreshKnownModels]);

  const clearModelPath = useCallback(async () => {
    setIsUpdatingPath(true);
    try {
      const result = await invoke<LlmStatus>("set_llm_model_path", { path: null });
      setStatus(result);
      await refreshKnownModels();
      notifyInfo("LLM configuration cleared.");
    } catch (err) {
      console.error(err);
      notifyError(`Failed to clear model: ${errorMessage(err)}`);
    } finally {
      setIsUpdatingPath(false);
    }
  }, [notifyError, notifyInfo, refreshKnownModels]);

  const downloadModel = useCallback(
    async (modelId: string, activate = false, force = false) => {
      const matchingModel = knownModels.find((model) => model.id === modelId);
      const modelName = matchingModel?.name ?? modelId;
      const wasInstalled = matchingModel?.downloaded ?? false;
      setDownloadingModelId(modelId);
      try {
        const result = await invoke<LlmStatus>("download_llm_model", {
          model_id: modelId,
          modelId,
          activate,
          force
        });
        setStatus(result);
        if (activate) {
          notifySuccess(`${modelName} downloaded and activated.`);
        } else if (force && wasInstalled) {
          notifySuccess(`${modelName} redownloaded.`);
        } else {
          notifySuccess(`${modelName} downloaded.`);
        }
      } catch (err) {
        console.error(err);
        notifyError(`Failed to download model: ${errorMessage(err)}`);
      } finally {
        setDownloadingModelId(null);
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[modelId];
          return newProgress;
        });
        await refreshKnownModels();
        if (activate) {
          await refreshStatus();
        }
      }
    },
    [knownModels, notifyError, notifySuccess, refreshKnownModels, refreshStatus]
  );

  const activateModel = useCallback(
    async (modelId: string, filename: string) => {
      const modelName = knownModels.find((model) => model.id === modelId)?.name ?? modelId;
      setActivatingModelId(modelId);
      try {
        const result = await invoke<LlmStatus>("set_llm_model_path", { path: filename });
        setStatus(result);
        notifySuccess(`${modelName} is now active.`);
      } catch (err) {
        console.error(err);
        notifyError(`Failed to activate model: ${errorMessage(err)}`);
      } finally {
        setActivatingModelId(null);
        await refreshKnownModels();
        await refreshStatus();
      }
    },
    [knownModels, notifyError, notifySuccess, refreshKnownModels, refreshStatus]
  );

  const downloadDefaultModel = useCallback(async () => {
    await downloadModel(DEFAULT_MODEL_ID, true);
  }, [downloadModel]);

  const isDownloading = downloadingModelId !== null;

  const busy = useMemo(
    () => isChecking || isUpdatingPath || isDownloading || activatingModelId !== null,
    [isChecking, isUpdatingPath, isDownloading, activatingModelId]
  );

  return {
    status,
    knownModels,
    isChecking,
    isUpdatingPath,
    isLoadingModels,
    isDownloading,
    downloadingModelId,
    activatingModelId,
    downloadProgress,
    busy,
    refreshStatus,
    refreshKnownModels,
    pickModelFile,
    clearModelPath,
    downloadModel,
    activateModel,
    downloadDefaultModel
  };
}
