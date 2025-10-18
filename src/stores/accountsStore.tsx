import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Account, ConnectAccountResponse, SavedAccount } from "../types";
import {
  connectAccount as connectAccountCommand,
  connectAccountWithSavedCredentials,
  disconnectAccount as disconnectAccountCommand,
  listSavedAccounts as listSavedAccountsCommand,
  testAccountConnection as testAccountConnectionCommand,
  type ConnectAccountRequest
} from "../services/accounts";
import type { TestAccountConnectionRequest } from "../services/accounts";

export type AccountLifecycleStatus = "idle" | "connecting" | "syncing" | "error";

export interface AccountRuntimeState {
  status: AccountLifecycleStatus;
  lastSync: number | null;
}

interface AccountsContextValue {
  accounts: Account[];
  savedAccounts: SavedAccount[];
  connectingSavedEmail: string | null;
  runtimeByEmail: Record<string, AccountRuntimeState>;
  setAccountStatus: (email: string, status: AccountLifecycleStatus) => void;
  setAccountLastSync: (email: string, timestamp: number | null) => void;
  testAccountConnection: (request: TestAccountConnectionRequest) => Promise<void>;
  refreshSavedAccounts: () => Promise<SavedAccount[]>;
  connectNewAccount: (request: ConnectAccountRequest) => Promise<ConnectAccountResponse>;
  connectSavedAccount: (saved: SavedAccount) => Promise<ConnectAccountResponse>;
  disconnectAccount: (email: string) => Promise<void>;
  replaceAccounts: (next: Account[]) => void;
  upsertAccount: (account: Account) => void;
}

const AccountsContext = createContext<AccountsContextValue | undefined>(undefined);

function upsertAccountInto(list: Account[], next: Account): Account[] {
  const index = list.findIndex((acct) => acct.email === next.email);
  if (index === -1) {
    return [...list, next];
  }
  const updated = [...list];
  updated[index] = next;
  return updated;
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [connectingSavedEmail, setConnectingSavedEmail] = useState<string | null>(null);
  const [runtimeByEmail, setRuntimeByEmail] = useState<Record<string, AccountRuntimeState>>({});

  const normalizeEmail = (email: string) => email.trim().toLowerCase();

  const setAccountStatus = useCallback((email: string, status: AccountLifecycleStatus) => {
    const key = normalizeEmail(email);
    setRuntimeByEmail((prev) => {
      const existing = prev[key] ?? { status: "idle" as AccountLifecycleStatus, lastSync: null };
      if (existing.status === status && prev[key]) {
        return prev;
      }
      return {
        ...prev,
        [key]: {
          ...existing,
          status
        }
      };
    });
  }, []);

  const setAccountLastSync = useCallback((email: string, timestamp: number | null) => {
    const key = normalizeEmail(email);
    setRuntimeByEmail((prev) => {
      const existing = prev[key] ?? { status: "idle" as AccountLifecycleStatus, lastSync: null };
      if (existing.lastSync === timestamp && prev[key]) {
        return prev;
      }
      return {
        ...prev,
        [key]: {
          ...existing,
          lastSync: timestamp
        }
      };
    });
  }, []);

  const refreshSavedAccounts = useCallback(async () => {
    const records = await listSavedAccountsCommand();
    setSavedAccounts(records);
    return records;
  }, []);

  const testAccountConnection = useCallback(async (request: TestAccountConnectionRequest) => {
    await testAccountConnectionCommand(request);
  }, []);

  const upsertAccount = useCallback((account: Account) => {
    setAccounts((prev) => upsertAccountInto(prev, account));
    setRuntimeByEmail((prev) => {
      const key = normalizeEmail(account.email);
      if (prev[key]) {
        return prev;
      }
      return {
        ...prev,
        [key]: {
          status: "idle",
          lastSync: null
        }
      };
    });
  }, []);

  const connectNewAccount = useCallback(
    async (request: ConnectAccountRequest) => {
      setAccountStatus(request.email, "connecting");
      try {
        const payload = await connectAccountCommand(request);
        upsertAccount(payload.account);
        setAccountStatus(payload.account.email, "idle");
        setAccountLastSync(payload.account.email, Date.now());
        await refreshSavedAccounts();
        return payload;
      } catch (err) {
        setAccountStatus(request.email, "error");
        throw err;
      }
    },
    [refreshSavedAccounts, upsertAccount, setAccountStatus, setAccountLastSync]
  );

  const connectSavedAccount = useCallback(
    async (saved: SavedAccount) => {
      setConnectingSavedEmail(saved.email);
      setAccountStatus(saved.email, "connecting");
      try {
        const payload = await connectAccountWithSavedCredentials(saved);
        upsertAccount(payload.account);
        setAccountStatus(payload.account.email, "idle");
        setAccountLastSync(payload.account.email, Date.now());
        await refreshSavedAccounts();
        return payload;
      } catch (err) {
        setAccountStatus(saved.email, "error");
        throw err;
      } finally {
        setConnectingSavedEmail(null);
      }
    },
    [refreshSavedAccounts, upsertAccount, setAccountStatus, setAccountLastSync]
  );

  const disconnectAccount = useCallback(
    async (email: string) => {
      await disconnectAccountCommand(email);
      setAccounts((prev) => prev.filter((acct) => acct.email !== email));
      setRuntimeByEmail((prev) => {
        const key = normalizeEmail(email);
        if (!(key in prev)) {
          return prev;
        }
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
      await refreshSavedAccounts();
    },
    [refreshSavedAccounts]
  );

  const replaceAccounts = useCallback((next: Account[]) => {
    setAccounts(next);
    setRuntimeByEmail((prev) => {
      const nextRuntime: Record<string, AccountRuntimeState> = {};
      next.forEach((account) => {
        const key = normalizeEmail(account.email);
        nextRuntime[key] = prev[key] ?? { status: "idle", lastSync: null };
      });
      return nextRuntime;
    });
  }, []);

  useEffect(() => {
    refreshSavedAccounts().catch((err) => {
      console.error("Failed to load saved accounts", err);
    });
  }, [refreshSavedAccounts]);

  const value = useMemo<AccountsContextValue>(
    () => ({
      accounts,
      savedAccounts,
      connectingSavedEmail,
      runtimeByEmail,
      setAccountStatus,
      setAccountLastSync,
  testAccountConnection,
      refreshSavedAccounts,
      connectNewAccount,
      connectSavedAccount,
      disconnectAccount,
      replaceAccounts,
      upsertAccount
    }),
    [
      accounts,
      savedAccounts,
      connectingSavedEmail,
      runtimeByEmail,
      setAccountStatus,
      setAccountLastSync,
  testAccountConnection,
      refreshSavedAccounts,
      connectNewAccount,
      connectSavedAccount,
      disconnectAccount,
      replaceAccounts,
      upsertAccount
    ]
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccountsStore(): AccountsContextValue {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error("useAccountsStore must be used within an AccountsProvider");
  }
  return context;
}
