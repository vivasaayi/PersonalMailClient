import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { ConnectAccountResponse, SavedAccount, Provider } from "../types";
import { useAccountsStore } from "../stores/accountsStore";
import { useNotifications } from "../stores/notifications";

const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  outlook: "Outlook / Live",
  yahoo: "Yahoo Mail",
  custom: "Custom IMAP"
};

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useAccountManagement() {
  const {
    accounts,
    savedAccounts,
    connectingSavedEmail,
    setAccountStatus: setAccountStatusAction,
    setAccountLastSync,
    refreshSavedAccounts,
    connectSavedAccount: connectSavedAccountAction,
    disconnectAccount: disconnectAccountAction,
    upsertAccount
  } = useAccountsStore();

  const { notifyError, notifyInfo, notifySuccess } = useNotifications();

  // Load saved accounts on mount
  const loadSavedAccounts = useCallback(async () => {
    try {
      await refreshSavedAccounts();
    } catch (err) {
      console.error(err);
      notifyError(errorMessage(err));
    }
  }, [refreshSavedAccounts, notifyError]);

  useEffect(() => {
    loadSavedAccounts().catch((err) => {
      console.error("Failed to load saved accounts", err);
    });
  }, [loadSavedAccounts]);

  // Apply connect response
  const applyConnectResponse = useCallback(
    async (payload: ConnectAccountResponse) => {
      upsertAccount(payload.account);

      // Note: Email state management is handled in the parent hook
      // This hook focuses on account management only
    },
    [upsertAccount]
  );

  const handleAccountConnected = useCallback(
    async ({
      response,
      source,
      savedAccount
    }: {
      response: ConnectAccountResponse;
      source: "new" | "saved";
      savedAccount?: SavedAccount;
    }) => {
      try {
        await applyConnectResponse(response);

        if (source === "saved" && savedAccount) {
          notifySuccess(`Reconnected ${savedAccount.email} using saved macOS keychain credentials.`);
        } else {
          notifySuccess(`Connected to ${providerLabels[response.account.provider]} as ${response.account.email}`);
        }
      } catch (err) {
        console.error("Failed to handle account connection", err);
        notifyError(`Failed to connect account: ${errorMessage(err)}`);
      }
    },
    [applyConnectResponse, notifySuccess, notifyError]
  );

  const handleConnectSavedAccount = useCallback(
    async (savedAccount: SavedAccount) => {
      try {
        const response = await connectSavedAccountAction(savedAccount);
        await handleAccountConnected({
          response,
          source: "saved",
          savedAccount
        });
      } catch (err) {
        console.error("Failed to connect saved account", err);
        notifyError(`Failed to connect saved account: ${errorMessage(err)}`);
      }
    },
    [connectSavedAccountAction, handleAccountConnected, notifyError]
  );

  const handleRemoveAccount = useCallback(
    async (email: string) => {
      try {
        await disconnectAccountAction(email);
        notifySuccess(`Disconnected from ${email}`);
      } catch (err) {
        console.error("Failed to disconnect account", err);
        notifyError(`Failed to disconnect account: ${errorMessage(err)}`);
      }
    },
    [disconnectAccountAction, notifySuccess, notifyError]
  );

  return {
    accounts,
    savedAccounts,
    connectingSavedEmail,
    loadSavedAccounts,
    handleAccountConnected,
    handleConnectSavedAccount,
    handleRemoveAccount,
    applyConnectResponse
  };
}