# Sidebar Navigation Refactoring

## Overview
Extracted the Webmail and Pivot views from being tabs within a single "Mailbox" view to separate sidebar menu items for better navigation and UX.

## Changes Made

### 1. NavigationDrawer.tsx
**Before**: Single "Mailbox" menu item (📬)  
**After**: Two separate menu items:
- **Webmail** (📧) - Day-to-day email reading and management
- **Pivot View** (📊) - Sender analysis and bulk classification

Both items are disabled when no account is selected, just like the original mailbox item.

### 2. App.tsx - renderViewContent()
**Before**: 
```typescript
if (currentView === "mailbox" && selectedAccount) {
  return createElement(Mailbox, { /* props */ });
}
```

**After**:
```typescript
if ((currentView === "webmail" || currentView === "pivot") && selectedAccount) {
  return createElement(Mailbox, {
    viewType: currentView as "webmail" | "pivot",
    /* other props */
  });
}
```

Now the Mailbox component receives a `viewType` prop to determine which view to render.

### 3. Mailbox.tsx
**Before**: Component used internal state (`useState`) to manage tab switching between webmail and pivot views.

**After**: Component receives `viewType` as a prop and renders the appropriate view directly.

**Removed**:
- `useState` for `activeTab`
- `tabs` array constant
- Tab toggle UI (buttons with icons)
- `activeTabMeta` variable

**Added**:
- `viewType` prop in `MailboxProps` interface
- `ViewType` type alias (`"webmail" | "pivot"`)
- `viewMeta` constant for view metadata
- `currentViewMeta` variable to get metadata for current view

**Updated rendering**:
- Replaced tab toggle section with simple header showing view title and description
- Changed conditional from `activeTab === "webmail"` to `viewType === "webmail"`

### 4. useUIState.ts
**Updated**:
- Default view changed from `"mailbox"` to `"webmail"`
- Auto-navigation check updated to include `"webmail"` and `"pivot"` instead of `"mailbox"`
- `handleAccountSelect` now navigates to `"webmail"` by default when an account is selected

### 5. index.css
**Added**:
- `.mailbox-view-header` - Container for view header
- `.mailbox-view-title` - Styled view title (h2)
- `.mailbox-view-description` - Styled view description text

**Preserved**:
- Legacy `.mailbox-view-toggle*` styles kept for backward compatibility

## User Experience Improvements

### Before
1. User clicks "Mailbox" in sidebar
2. Mailbox view loads with tabs at the top
3. User clicks "Webmail" or "Pivot" tab to switch views
4. Tab state is lost when navigating away

### After
1. User clicks "Webmail" or "Pivot View" directly in sidebar
2. Selected view loads immediately
3. View selection persists in navigation state
4. Clearer navigation hierarchy - views are first-class navigation items

## Benefits

1. **Clearer Navigation**: Users can see both views in the sidebar without needing to know about tabs
2. **Direct Access**: One click to get to the desired view instead of two
3. **Better Persistence**: View selection is part of navigation state, so it's preserved across sessions
4. **Simplified Code**: Removed internal state management from Mailbox component
5. **Consistent UX**: All major views are now top-level navigation items

## Technical Benefits

1. **Separation of Concerns**: Navigation logic moved from component to routing layer
2. **Prop-driven**: Mailbox is now a pure functional component driven by props
3. **No Internal State**: Easier to test and reason about
4. **Flexible Architecture**: Easy to add more views in the future

## Migration Notes

- Old "mailbox" view type is no longer used
- Components should use "webmail" or "pivot" for navigation
- The Mailbox component still serves as the container for both views
- No changes needed to WebMailView or SenderGrid components

## Testing Checklist

- [ ] Webmail menu item is disabled when no account selected
- [ ] Pivot View menu item is disabled when no account selected
- [ ] Clicking Webmail loads the webmail interface
- [ ] Clicking Pivot View loads the sender grid/pivot interface
- [ ] Selecting an account defaults to Webmail view
- [ ] Navigation between views works correctly
- [ ] View state persists when switching between accounts
- [ ] All sync/refresh operations work in both views
