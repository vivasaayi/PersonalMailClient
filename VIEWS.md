# Email View Modes

The mailbox now supports two distinct viewing modes for different workflows:

## 📧 Webmail View

**Purpose:** Day-to-day email reading and management

### Features:
- **List + Detail Layout:** Familiar email client interface with message list on left, reading pane on right
- **Quick Navigation:** Click any message to view full details in reading pane
- **AI Summary Display:** Shows AI-generated summaries, sentiment analysis, and categories at top of message
- **Responsive Layout:** Reading pane expands when email selected, collapses when closed
- **Smart Dates:** Shows time for today's emails, "Yesterday" for recent, day-of-week or date for older
- **Virtualized List:** Handles large inboxes efficiently with virtual scrolling
- **✨ Sender Grouping:** Toggle between flat list and grouped-by-sender views
  - **List Mode:** All emails in chronological order
  - **Group Mode:** Emails organized by sender with collapsible groups
  - Click group headers to expand/collapse sender's messages
  - Badge shows message count per sender

### Use Cases:
- Quick daily email checking
- Reading and reviewing individual messages
- Triaging inbox with AI assistance
- One-by-one message processing
- **NEW:** Identifying high-volume senders at a glance
- **NEW:** Batch-reviewing emails from specific senders

---

## 📊 Pivot View

**Purpose:** Bulk sender analysis and classification

### Features:
- **Sender Grouping:** Messages grouped by sender with aggregate stats
- **Bulk Status Management:** Allow/Neutral/Block actions per sender
- **Detail Expansion:** Click sender to see all their messages with full analysis
- **Status Filtering:** Group by sender status for workflow automation
- **Message Deletion:** Remove individual messages from expanded sender view
- **Domain Clustering:** Optional grouping by email domain

### Use Cases:
- Bulk sender classification (allow/block lists)
- Analyzing communication patterns by sender
- Cleaning up spam/promotional emails in bulk
- Building automated filtering rules

---

## Switching Between Views

Use the toggle buttons at the top of the mailbox:
- **Webmail (📧):** For reading individual emails
- **Pivot (📊):** For sender-based analysis

Both views share the same data and sync status, so you can switch freely based on your current task.

---

## Design Philosophy

**Webmail View** = Traditional email client experience optimized for reading  
**Pivot View** = Data analysis tool optimized for pattern recognition and bulk actions

The separation ensures each workflow has the right UI/UX without compromising the other.
