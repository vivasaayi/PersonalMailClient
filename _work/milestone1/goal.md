
## current pain points
- **Fragmented account management:** adding, reconnecting, and removing accounts live in different dialogs with limited context (no overview or health status).
- **Mailbox entry friction:** when an account isn’t selected the main panel feels empty, and saved accounts are hidden behind modals.
- **Provider-specific handling is implicit:** Yahoo vs. other providers share the same wizard but no guidance about app passwords or testing credentials.

## target workflow (single-account first, multi-account ready)
1. **Onboarding / Home**
   - Tidy hero with two primary actions: *“Add Account”* and *“Import Saved Account”*.
   - Below, a checklist or timeline hints: Connect → Test → Sync → Review.

2. **Account management hub**
   - A dedicated “Accounts” view listing each profile with quick stats (last sync, errors, credential status).
   - Inline actions: `Connect` (if offline), `Test`, `Sync Now`, `Edit server settings`, `Remove`.
   - A right-rail detail panel shows provider-specific setup tips (e.g., Yahoo app password instructions).

3. **Add / edit flow**
   - Wizard reshaped into three steps:
     1. Provider & guidance (dynamic copy per provider).
     2. Credentials + optional advanced settings.
     3. Verification (tests IMAP login immediately and shows result before saving).
   - On success, account auto-saves and the user can jump straight to the mailbox.

4. **Mailbox view**
   - Persistent top bar showing current account, storage usage, and quick actions (Sync, Test Connection, Settings).
   - Two primary tabs: *Inbox* (email list + preview) and *Insights* (senders, automations).
   - Contextual empties: If no account selected, show a prompt linking back to “Manage Accounts”.

5. **Saved account quick launch**
   - From any screen, a sidebar drawer lists saved accounts; clicking switches the global context and rehydrates state.
   - When only Yahoo exists, the drawer defaults to it so the user lands directly in the mailbox after onboarding.

6. **Error handling**
   - Centralized notifications: connection failures surface in the account card and the top bar, with a “Fix” link bringing users back to edit credentials or re-run the test.

## proposed UX layout
- **Left sidebar:** collapsible navigation with sections—Mailbox, Automations, Accounts, Settings. At the bottom, “+ Add Account” and “Saved Accounts”.
- **Main content area:** switches between mailbox panes (list + detail), automation dashboards, or account management grid.
- **Right contextual panel:** used across views for instructions, live sync progress, or account metadata.

## implementation phases
1. **Foundational cleanup (Sprint 1)**
   - Build Account Management view (list + actions).
   - Extract account CRUD/test logic into reusable hooks/services.
   - Simplify connection wizard and add success verification step.

2. **Mailbox polish (Sprint 2)**
   - Integrate new top bar with account status and sync controls.
  - Improve empty states and ensure single-account Yahoo flow is frictionless.
  - Add inline test connection button and result banners.

3. **Global navigation & quick actions (Sprint 3)**
   - Rework sidebar and saved accounts drawer.
   - Implement contextual right panel, unify notification system.

4. **Refinement & extensibility (Sprint 4)**
   - Add provider-specific copy blocks, prepare hooks for Gmail/Outlook extensions.
   - User testing feedback loop: tweak flows, add keyboard shortcuts, finalize styling.

5. **Future-ready enhancements**
   - Multi-account simultaneous view (tabs or stacked layout).
   - Automation and blocked sender management deeper integration.
   - Metrics/logging dashboards for sync health.

With this structure, we can focus the MVP on Yahoo while ensuring every screen gracefully scales to more providers later. Let me know which phase you’d like to tackle first, and I’ll start drafting concrete tasks.