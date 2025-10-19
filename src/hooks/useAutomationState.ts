import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { Account } from "../types";
import { useNotifications } from "../stores/notifications";

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useAutomationState() {
  const { notifyError, notifyInfo, notifySuccess } = useNotifications();
  
  const [periodicMinutesByAccount, setPeriodicMinutesByAccount] = useState<Record<string, number>>({});
  const [isSavingPeriodic, setIsSavingPeriodic] = useState(false);
  const [isApplyingBlockFilter, setIsApplyingBlockFilter] = useState(false);
  const [blockFolder, setBlockFolder] = useState<string>("Blocked");

  const handlePeriodicMinutesChange = useCallback((accountEmail: string, value: number) => {
    setPeriodicMinutesByAccount((prev) => ({
      ...prev,
      [accountEmail]: value
    }));
  }, []);

  const handleSavePeriodicSync = useCallback(
    async (accountEmail: string, accounts: Account[], account: Account | null) => {
      if (!account) return;

      const minutes = periodicMinutesByAccount[accountEmail] ?? 0;
      const minutesValue = minutes > 0 ? minutes : null;
      setIsSavingPeriodic(true);

      try {
        await invoke("configure_periodic_sync", {
          provider: account.provider,
          email: account.email,
          minutes: minutesValue
        });
        if (minutesValue) {
          notifySuccess(
            `Periodic sync every ${minutesValue} minute${minutesValue === 1 ? "" : "s"} enabled.`
          );
        } else {
          notifyInfo("Periodic sync disabled.");
        }
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      } finally {
        setIsSavingPeriodic(false);
      }
    },
    [periodicMinutesByAccount, notifyError, notifyInfo, notifySuccess]
  );

  const handleApplyBlockFilter = useCallback(
    async (
      accountEmail: string,
      accounts: Account[],
      account: Account | null,
      refreshFn: (email: string, limit?: number, toast?: boolean) => Promise<void>
    ) => {
      if (!account) return;

      setIsApplyingBlockFilter(true);
      try {
        const moved = await invoke<number>("apply_block_filter", {
          provider: account.provider,
          email: account.email,
          target_folder: blockFolder.trim() ? blockFolder.trim() : null
        });
        await refreshFn(account.email, 25, false);
        if (moved > 0) {
          notifySuccess(
            `Moved ${moved} message${moved === 1 ? "" : "s"} to ${blockFolder || "the blocked folder"}.`
          );
        } else {
          notifyInfo("No messages matched the blocked list.");
        }
      } catch (err) {
        console.error(err);
        notifyError(errorMessage(err));
      } finally {
        setIsApplyingBlockFilter(false);
      }
    },
    [blockFolder, notifyError, notifyInfo, notifySuccess]
  );

  const clearAutomationData = useCallback((email: string) => {
    setPeriodicMinutesByAccount((prev) => {
      const { [email]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    periodicMinutesByAccount,
    isSavingPeriodic,
    isApplyingBlockFilter,
    blockFolder,
    setBlockFolder,
    handlePeriodicMinutesChange,
    handleSavePeriodicSync,
    handleApplyBlockFilter,
    clearAutomationData
  };
}
