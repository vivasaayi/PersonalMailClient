export type Provider = "gmail" | "outlook" | "yahoo" | "custom";

export interface Account {
  provider: Provider;
  email: string;
  display_name?: string | null;
  custom_host?: string | null;
  custom_port?: number | null;
}

export interface MailAddress {
  email: string;
  display_name?: string | null;
}

export interface EmailSummary {
  uid: string;
  subject: string;
  sender: MailAddress;
  date?: string | null;
}

export interface DeletedEmail {
  uid: string;
  subject: string;
  sender_email: string;
  sender_display?: string | null;
  snippet?: string | null;
  date?: string | null;
  analysis_summary?: string | null;
  analysis_sentiment?: string | null;
  analysis_categories: string[];
  deleted_at: number;
  remote_deleted_at?: number | null;
  remote_error?: string | null;
}

export interface RemoteDeleteUpdate {
  uid: string;
  remote_deleted_at?: number | null;
  remote_error?: string | null;
}

export interface RemoteDeleteStatusPayload {
  account_email: string;
  updates: RemoteDeleteUpdate[];
}

export interface RemoteDeleteQueuedPayload {
  account_email: string;
  uids: string[];
}

export interface RemoteDeleteProgressSummary {
  account_email: string;
  total: number;
  completed: number;
  failed: number;
}

export type RemoteDeleteOverrideMode = "auto" | "force-batch";

export interface RemoteDeleteMetricsSnapshot {
  account_email: string;
  timestamp: number;
  mode: string;
  batch_size: number;
  processed: number;
  failed: number;
  pending: number;
  total_pending: number;
  rate_per_minute: number;
  override_mode: RemoteDeleteOverrideMode;
}

export interface RemoteDeleteMetricsHistoryEntry {
  timestamp: number;
  processed: number;
  mode: string;
  pending: number;
}

export interface RemoteDeleteMetricsResponse {
  account_email: string;
  latest: RemoteDeleteMetricsSnapshot;
  history: RemoteDeleteMetricsHistoryEntry[];
}

export type SenderStatus = "neutral" | "allowed" | "blocked";

export interface AnalyzedMessage {
  uid: string;
  subject: string;
  date?: string | null;
  snippet?: string | null;
  status: SenderStatus;
  flags?: string | null;
  analysis_summary?: string | null;
  analysis_sentiment?: string | null;
  analysis_categories: string[];
}

export interface SenderGroup {
  sender_email: string;
  sender_display: string;
  status: SenderStatus;
  message_count: number;
  messages: AnalyzedMessage[];
}

export interface SavedAccount {
  provider: Provider;
  email: string;
  custom_host?: string | null;
  custom_port?: number | null;
  has_password: boolean;
}

export interface ConnectAccountRequest {
  provider: Provider;
  email: string;
  password: string;
  customHost?: string;
  customPort?: number;
}

export interface ConnectAccountResponse {
  account: Account;
  emails: EmailSummary[];
}

export interface SyncReport {
  fetched: number;
  stored: number;
  duration_ms: number;
}

export interface SyncProgress {
  email: string;
  batch: number;
  total_batches: number;
  fetched: number;
  stored: number;
  elapsed_ms: number;
}

export interface LlmStatus {
  configured_path?: string | null;
  loaded: boolean;
  last_error?: string | null;
}

export interface KnownLlmModel {
  id: string;
  name: string;
  description: string;
  filename: string;
  url: string;
  size_bytes: number;
  recommended_ram_gb: number;
  context_length: number;
  notes: string;
  is_default: boolean;
  downloaded: boolean;
  active: boolean;
  installed_size_bytes?: number | null;
}
