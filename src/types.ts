export type Provider = "gmail" | "outlook" | "yahoo";

export interface Account {
  provider: Provider;
  email: string;
  display_name?: string | null;
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
