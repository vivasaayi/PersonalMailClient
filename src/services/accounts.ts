import { invoke } from "@tauri-apps/api/tauri";
import type {
  Account,
  ConnectAccountResponse,
  Provider,
  SavedAccount
} from "../types";

export interface ConnectAccountRequest {
  provider: Provider;
  email: string;
  password: string;
  customHost?: string;
  customPort?: number;
}

export interface TestAccountConnectionRequest {
  provider: Provider;
  email: string;
  password?: string;
  customHost?: string;
  customPort?: number;
}

export async function listSavedAccounts(): Promise<SavedAccount[]> {
  return invoke<SavedAccount[]>("list_saved_accounts");
}

export async function listConnectedAccounts(): Promise<Account[]> {
  return invoke<Account[]>("list_connected_accounts");
}

export async function connectAccount(request: ConnectAccountRequest): Promise<ConnectAccountResponse> {
  return invoke<ConnectAccountResponse>("connect_account", {
    provider: request.provider,
    email: request.email,
    password: request.password,
    customHost: request.customHost,
    customPort: request.customPort
  });
}

export async function testAccountConnection(request: TestAccountConnectionRequest): Promise<void> {
  await invoke("test_account_connection", {
    provider: request.provider,
    email: request.email,
    password: request.password,
    customHost: request.customHost,
    customPort: request.customPort
  });
}

export async function connectAccountWithSavedCredentials(saved: SavedAccount): Promise<ConnectAccountResponse> {
  return invoke<ConnectAccountResponse>("connect_account_saved", {
    provider: saved.provider,
    email: saved.email
  });
}

export async function disconnectAccount(email: string): Promise<void> {
  await invoke("disconnect_account", { email });
}
