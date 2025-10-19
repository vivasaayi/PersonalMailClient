# WebMail View - Grouping and Color Coding Features

## Overview
The WebMail View now supports multiple grouping options and color-coded email highlighting based on sender status.

## Grouping Options

### 1. **List View** (No Grouping)
- Default flat list view showing all emails chronologically
- Shows sender name/email and date for each message
- Fastest for scanning recent messages

### 2. **By Sender Name** 
- Groups emails by the sender's display name
- Useful when you want to see all emails from "John Doe" together
- Expands/collapses to show individual messages per sender

### 3. **By Sender Email**
- Groups emails by the sender's email address
- Useful for distinguishing between multiple people with the same name
- Shows exact email addresses as group headers

### 4. **By Day**
- Groups emails by the date they were received
- Format: "Mon, Dec 16, 2024" (or similar based on locale)
- Useful for reviewing what arrived on specific days

## Color Coding

Emails are highlighted based on their sender status:

- **🟢 Green (`#90ee90`)**: Allowed senders - emails you've marked as trusted
- **🔴 Salmon (`#fa8072`)**: Blocked senders - emails from senders you've blocked
- **⚪ White**: Neutral senders - default state for new/unknown senders

The color coding applies to both:
- Individual items in the flat list view
- Individual items within grouped views

**Note**: Selected emails always show with blue background (`#eff6ff`), overriding status colors.

## User Interface

### Toolbar
- **List Button**: Switches to flat list view (no grouping)
- **Group By Dropdown**: Provides three grouping options
  - By Sender Name
  - By Sender Email  
  - By Day

### Group Headers
When grouped, each group shows:
- Expand/collapse arrow (▶/▼)
- Group label (sender name, email, or date)
- Count badge showing number of emails in that group

## Technical Implementation

### Data Structure
```typescript
type GroupMode = "none" | "sender-name" | "sender-email" | "by-day";

interface GroupedEmails {
  key: string;        // Unique identifier (email, name, or date)
  label: string;      // Display text for group header
  emails: EmailSummary[];
  count: number;
}
```

### Grouping Logic
- **sender-name**: Uses `email.sender.display_name` or falls back to email
- **sender-email**: Uses `email.sender.email`
- **by-day**: Formats `email.date` as locale date string

### Color Assignment
```typescript
if (insight?.message?.status === "blocked") {
  backgroundColor = "#fa8072"; // salmon
} else if (insight?.message?.status === "allowed") {
  backgroundColor = "#90ee90"; // light green
} else {
  backgroundColor = "#ffffff"; // white (neutral)
}
```

## Usage Tips

1. **Quick scanning**: Use List view for chronological review
2. **Finding all emails from a person**: Use "By Sender Name" or "By Sender Email"
3. **Reviewing a specific day**: Use "By Day" grouping
4. **Identifying trusted/blocked senders**: Look for green/salmon highlights
5. **Managing conversations**: Expand a sender group to see all their emails

## Future Enhancements

Potential improvements:
- Group by subject (conversation threads)
- Group by folder/label
- Custom date range grouping (week, month)
- Additional status colors for other classifications
- Remember user's preferred grouping mode
