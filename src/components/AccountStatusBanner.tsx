import type { ReactNode } from "react";
import type { Account } from "../types";
import type { StatusPill } from "../utils/mailboxStatus";

export interface ProviderPalette {
  label: string;
  icon: string;
  gradient: string;
  chipBg: string;
  chipBorder: string;
  chipColor: string;
  avatarBg: string;
  avatarColor: string;
}

type ProviderKey = Account["provider"];

const providerPalettes: Record<ProviderKey | "default", ProviderPalette> = {
  gmail: {
    label: "Gmail",
    icon: "✉️",
    gradient: "linear-gradient(135deg, #dc2626 0%, #f97316 100%)",
    chipBg: "rgba(248, 113, 113, 0.25)",
    chipBorder: "rgba(248, 113, 113, 0.45)",
    chipColor: "#fee2e2",
    avatarBg: "rgba(248, 113, 113, 0.4)",
    avatarColor: "#fff7ed"
  },
  outlook: {
    label: "Outlook",
    icon: "📬",
    gradient: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
    chipBg: "rgba(59, 130, 246, 0.25)",
    chipBorder: "rgba(59, 130, 246, 0.45)",
    chipColor: "#dbeafe",
    avatarBg: "rgba(59, 130, 246, 0.45)",
    avatarColor: "#e0f2fe"
  },
  yahoo: {
    label: "Yahoo Mail",
    icon: "📮",
    gradient: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
    chipBg: "rgba(167, 139, 250, 0.3)",
    chipBorder: "rgba(167, 139, 250, 0.55)",
    chipColor: "#ede9fe",
    avatarBg: "rgba(167, 139, 250, 0.45)",
    avatarColor: "#faf5ff"
  },
  custom: {
    label: "Custom IMAP",
    icon: "⚙️",
    gradient: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
    chipBg: "rgba(45, 212, 191, 0.28)",
    chipBorder: "rgba(45, 212, 191, 0.5)",
    chipColor: "#ccfbf1",
    avatarBg: "rgba(45, 212, 191, 0.45)",
    avatarColor: "#ecfeff"
  },
  default: {
    label: "Mailbox",
    icon: "📫",
    gradient: "linear-gradient(135deg, #1f2937 0%, #334155 100%)",
    chipBg: "rgba(148, 163, 184, 0.28)",
    chipBorder: "rgba(148, 163, 184, 0.4)",
    chipColor: "#e2e8f0",
    avatarBg: "rgba(148, 163, 184, 0.35)",
    avatarColor: "#f8fafc"
  }
};

export function getProviderPalette(provider?: ProviderKey | null): ProviderPalette {
  if (!provider) {
    return providerPalettes.default;
  }
  return providerPalettes[provider] ?? providerPalettes.default;
}

interface AccountStatusBannerProps {
  account?: Account;
  email: string;
  statusPills: StatusPill[];
  actions?: ReactNode;
}

export function AccountStatusBanner({ account, email, statusPills, actions }: AccountStatusBannerProps) {
  const palette = getProviderPalette(account?.provider ?? null);
  const displayName = account?.display_name?.trim() || email;
  const accountInitial = displayName.trim().charAt(0).toUpperCase() || "@";

  return (
    <header
      className="mailbox-topbar"
      style={{
        background: palette.gradient,
        color: "#f8fafc"
      }}
    >
      <div className="mailbox-topbar__profile">
        <div
          className="mailbox-topbar__avatar"
          style={{
            background: palette.avatarBg,
            color: palette.avatarColor
          }}
        >
          {accountInitial}
        </div>
        <div className="mailbox-topbar__meta">
          <span className="mailbox-topbar__name">{displayName}</span>
          <span className="mailbox-topbar__email">{email}</span>
          <span
            className="mailbox-topbar__chip"
            style={{
              background: palette.chipBg,
              borderColor: palette.chipBorder,
              color: palette.chipColor
            }}
          >
            <span>{palette.icon}</span>
            <span>{palette.label}</span>
          </span>
        </div>
      </div>
      <div className="mailbox-topbar__quick">
        {statusPills.length > 0 && (
          <div className="mailbox-topbar__status">
            {statusPills.map((pill) => (
              <span
                key={pill.key}
                className={`mailbox-topbar-pill${pill.tone ? ` ${pill.tone}` : ""}`}
              >
                {pill.text}
              </span>
            ))}
          </div>
        )}
        {actions && <div className="mailbox-topbar__buttons">{actions}</div>}
      </div>
    </header>
  );
}
