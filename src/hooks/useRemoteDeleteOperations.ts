import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import type {
  RemoteDeleteUpdate,
  RemoteDeleteMetricsResponse,
  RemoteDeleteQueuedPayload,
  RemoteDeleteStatusPayload,
  RemoteDeleteOverrideMode
} from "../types";

type RemoteDeleteCounters = {
  pending: number;
  completed: number;
  failed: number;
};

export function useRemoteDeleteOperations() {
  const remoteDeletePendingRef = useRef<Record<string, Set<string>>>({});
  const [remoteDeleteProgressMap, setRemoteDeleteProgressMap] = useState<
    Record<string, RemoteDeleteCounters>
  >({});
  const remoteDeleteMetricsFetchedAtRef = useRef<Record<string, number>>({});
  const [remoteDeleteMetricsByAccount, setRemoteDeleteMetricsByAccount] = useState<
    Record<string, RemoteDeleteMetricsResponse>
  >({});
  const [remoteDeleteMetricsLoading, setRemoteDeleteMetricsLoading] = useState<
    Record<string, boolean>
  >({});

  const registerRemoteDeletes = useCallback((accountEmail: string, uids: string[]) => {
    if (uids.length === 0) return;
    const normalized = accountEmail.trim().toLowerCase();

    setRemoteDeleteProgressMap((prev) => {
      const existingSet = new Set(remoteDeletePendingRef.current[normalized] ?? []);
      let added = 0;
      for (const uid of uids) {
        if (!existingSet.has(uid)) {
          existingSet.add(uid);
          added += 1;
        }
      }

      if (added === 0) {
        return prev;
      }

      remoteDeletePendingRef.current[normalized] = existingSet;
      const previous = prev[normalized];
      const resetCycle = !previous || previous.pending === 0;
      const nextEntry: RemoteDeleteCounters = resetCycle
        ? { pending: existingSet.size, completed: 0, failed: 0 }
        : { pending: existingSet.size, completed: previous.completed, failed: previous.failed };

      return {
        ...prev,
        [normalized]: nextEntry
      };
    });
  }, []);

  const applyRemoteDeleteUpdates = useCallback(
    (accountEmail: string, updates: RemoteDeleteUpdate[]) => {
      if (updates.length === 0) return;
      const normalized = accountEmail.trim().toLowerCase();

      setRemoteDeleteProgressMap((prev) => {
        const existingSet = new Set(remoteDeletePendingRef.current[normalized] ?? []);
        let completedInc = 0;
        let failedInc = 0;

        for (const update of updates) {
          if (existingSet.has(update.uid)) {
            existingSet.delete(update.uid);
            completedInc += 1;
            if (update.remote_error && update.remote_error.length > 0) {
              failedInc += 1;
            }
          }
        }

        remoteDeletePendingRef.current[normalized] = existingSet;

        if (completedInc === 0 && failedInc === 0 && !prev[normalized]) {
          return prev;
        }

        const previous = prev[normalized] ?? {
          pending: existingSet.size + completedInc,
          completed: 0,
          failed: 0
        };

        const nextPending = existingSet.size;
        const nextCounters: RemoteDeleteCounters = {
          pending: nextPending,
          completed: previous.completed + completedInc,
          failed: previous.failed + failedInc
        };

        if (nextPending === 0) {
          if (!prev[normalized]) {
            return prev;
          }
          const nextMap = { ...prev };
          delete nextMap[normalized];
          return nextMap;
        }

        return {
          ...prev,
          [normalized]: nextCounters
        };
      });
    },
    []
  );

  // Event listeners for remote delete operations
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    listen<RemoteDeleteQueuedPayload>("remote-delete-queued", (event) => {
      if (!event.payload) return;
      const { account_email, uids } = event.payload;
      if (!uids || uids.length === 0) {
        return;
      }
      registerRemoteDeletes(account_email, uids);
    })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch((err) => {
        console.error("Failed to register remote delete queue listener", err);
      });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [registerRemoteDeletes]);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    listen<RemoteDeleteStatusPayload>("remote-delete-status", (event) => {
      if (!event.payload) return;
      const payload = event.payload;
      // Note: updateDeletedEmailStatus and notifications are handled in the parent hook
      applyRemoteDeleteUpdates(payload.account_email, payload.updates);
    })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch((err) => {
        console.error("Failed to register remote delete listener", err);
      });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [applyRemoteDeleteUpdates]);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    listen<RemoteDeleteMetricsResponse>("remote-delete-metrics", (event) => {
      if (!event.payload) return;
      const payload = event.payload;
      const normalized = payload.account_email.trim().toLowerCase();
      remoteDeleteMetricsFetchedAtRef.current[normalized] = Date.now();
      setRemoteDeleteMetricsByAccount((prev) => ({
        ...prev,
        [normalized]: payload
      }));
      setRemoteDeleteMetricsLoading((prev) => {
        if (!prev[normalized]) {
          return prev;
        }
        return {
          ...prev,
          [normalized]: false
        };
      });
    })
      .then((unlisten) => {
        if (!mounted) {
          unlisten();
        } else {
          cleanup = unlisten;
        }
      })
      .catch((err) => {
        console.error("Failed to register remote delete metrics listener", err);
      });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  const fetchRemoteDeleteMetrics = useCallback(async (accountEmail: string, options?: { force?: boolean }) => {
    const normalized = accountEmail.trim().toLowerCase();
    const lastFetched = remoteDeleteMetricsFetchedAtRef.current[normalized] ?? 0;
    const now = Date.now();
    const cacheAge = now - lastFetched;

    if (!options?.force && cacheAge < 30000) { // 30 second cache
      return;
    }

    setRemoteDeleteMetricsLoading((prev) => ({
      ...prev,
      [normalized]: true
    }));

    try {
      await invoke("fetch_remote_delete_metrics", { accountEmail });
    } catch (err) {
      console.error("Failed to fetch remote delete metrics", err);
      setRemoteDeleteMetricsLoading((prev) => ({
        ...prev,
        [normalized]: false
      }));
    }
  }, []);

  const updateRemoteDeleteOverride = useCallback(async (accountEmail: string, mode: RemoteDeleteOverrideMode) => {
    try {
      await invoke("update_remote_delete_override", { accountEmail, mode });
    } catch (err) {
      console.error("Failed to update remote delete override", err);
    }
  }, []);

  return {
    remoteDeleteProgressMap,
    remoteDeleteMetricsByAccount,
    remoteDeleteMetricsLoading,
    registerRemoteDeletes,
    applyRemoteDeleteUpdates,
    fetchRemoteDeleteMetrics,
    updateRemoteDeleteOverride
  };
}