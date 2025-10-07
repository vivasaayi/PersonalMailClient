# Personal Mail Client

A cross-platform desktop client built with [Tauri](https://tauri.app/) and Rust that lets you connect multiple consumer email providers—Gmail, Outlook/Live, and Yahoo Mail—using IMAP and application-specific passwords. The UI is delivered through a modern React + Vite frontend, while the Rust core handles secure account management and IMAP fetching.

> ⚠️ **Security note:** For now the application authenticates via provider-issued app passwords (recommended by Gmail, Outlook, and Yahoo for third-party clients). These credentials are held in memory only and never written to disk, but they are present in-process while the app runs. Future milestones should integrate OAuth 2.0 with secure token storage.

## Features

- 📥 Connect multiple inboxes (Gmail, Outlook/Live, Yahoo Mail) simultaneously.
- 🔐 Uses TLS-encrypted IMAP sessions and application passwords; nothing is persisted locally.
- 📨 Fetches the 25 most recent messages with subject, sender, and timestamp metadata.
- 🔄 One-click refresh for the selected mailbox.
- 🧹 Disconnect accounts on demand; state clears immediately.
- 🧩 Modular provider layer so you can extend support for additional providers or alternate auth flows.

## Architecture Overview

```
┌────────────────────┐        ┌────────────────────────────────┐
│  React + Vite UI   │ <────► │  Tauri Commands (Rust async)   │
│ (src/**/*.tsx)      │ invoke │  • Account registry (RwLock)   │
│                    │        │  • Provider adapters (IMAP)    │
└────────────────────┘        └────────────────────────────────┘
            ▲                                     │
            │                                     ▼
            │                         TLS-encrypted IMAP servers
            │
            └──── state updates & mailbox data (JSON)
```

- `src-tauri/` contains the Rust core, including the IMAP provider implementation.
- `src/` contains the React UI that talks to Rust via `@tauri-apps/api/tauri` commands.

## Prerequisites

- **Rust** (1.72 or later) with the `wasm32-unknown-unknown` target and cargo.
- **Node.js** 18+ (LTS recommended) and npm.
- Platform-specific Tauri prerequisites (Xcode command-line tools on macOS, etc.). See [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites).
- Application-specific passwords for each provider you connect:
  - **Gmail:** Google Account → Security → "App passwords" → select "Mail" & your device → generate token.
  - **Outlook/Live:** Microsoft Account → Security → "Advanced security options" → "App passwords".
  - **Yahoo Mail:** Account Security → "Manage app passwords" → choose "Other app".

## Getting Started

Install JavaScript dependencies and Tauri CLI:

```bash
npm install
```

Generate the Rust lockfile and ensure dependencies compile:

```bash
( cd src-tauri && cargo generate-lockfile )
```

Run the desktop app in development mode (opens a Tauri window with the Vite dev server):

```bash
npm run tauri:dev
```

Create a production bundle:

```bash
npm run tauri:build
```

## Usage Tips

1. Launch the app and add an account.
2. Choose the provider, enter the email address, and paste the application password.
3. After connecting you'll see the most recent emails. Use **Refresh** to fetch the latest.
4. Disconnect an account using the ✕ button next to it; this purges in-memory credentials.

### Troubleshooting

- **Authentication errors** – Double-check that you're using an app password and IMAP is enabled for the account.
- **IMAP errors** – Temporary network issues or provider throttling can trigger these. Wait a moment and use **Refresh**.
- **Build failures** – Confirm you have platform prerequisites for Tauri installed.

## Next Steps (Ideas)

- Migrate to OAuth 2.0 for all providers (using PKCE / device code flows) and store refresh tokens securely.
- Cache message bodies locally (with encryption) and enable offline access.
- Add search, filtering, and bulk actions.
- Integrate a unified notification system for new emails across accounts.

## License

This project is provided under the MIT License. See [LICENSE](LICENSE) if/when added.
# PersonalMailClient
