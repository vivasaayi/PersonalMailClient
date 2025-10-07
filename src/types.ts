export type Provider = "gmail" | "outlook" | "yahoo";

export interface Account {
  provider: Provider;
  email: string;
  display_name?: string | null;
}

export interface EmailSummary {
  uid: string;
  subject: string;
  from: string;
  date?: string | null;
}

export interface ConnectAccountResponse {
  account: Account;
  emails: EmailSummary[];
}
