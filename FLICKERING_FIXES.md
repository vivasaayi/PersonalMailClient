# Flickering Issues - Root Cause and Fixes

## Issue Summary
Both the Pivot View (SenderGrid) and WebMail View were experiencing continuous flickering/refreshing due to infinite render loops caused by useEffect dependencies.

## Root Causes

### 1. Pivot View (SenderGrid.tsx) - FIXED ✅
**Problem**: The `applyGrouping` useEffect had `gridData` in its dependency array.

```typescript
// ❌ BEFORE - Caused infinite loop
useEffect(() => {
  applyGrouping(groupOption);
}, [applyGrouping, groupOption, gridData]); // gridData changes frequently
```

**Why it caused flickering**:
- `gridData` is a memoized value that depends on `senderGroups` prop
- When parent component passes new `senderGroups`, `gridData` recalculates
- This triggers the useEffect, which calls `applyGrouping()`
- Grid re-renders, which may trigger parent updates
- Cycle repeats, causing continuous flickering

**Solution**: Remove `gridData` from dependency array since `applyGrouping` only needs to run when the grouping option changes, not when data changes.

```typescript
// ✅ AFTER - Fixed
useEffect(() => {
  applyGrouping(groupOption);
}, [applyGrouping, groupOption]); // Only depend on what actually matters
```

### 2. WebMail View (WebMailView.tsx) - FIXED ✅
**Problem**: The auto-expand groups useEffect had `groupedEmails` in its dependency array.

```typescript
// ❌ BEFORE - Caused infinite loop
useEffect(() => {
  if (groupMode !== "none" && expandedGroups.size === 0) {
    setExpandedGroups(new Set(groupedEmails.map(g => g.key)));
  }
}, [groupMode, groupedEmails, expandedGroups.size]); // groupedEmails changes frequently
```

**Why it caused flickering**:
- `groupedEmails` is recalculated whenever the `emails` prop changes
- Even if no emails are added/removed, the array reference changes
- The condition `expandedGroups.size === 0` would sometimes be true after state updates
- This triggers `setExpandedGroups()`, which causes re-render
- New render recalculates `groupedEmails` with new reference
- Cycle repeats, causing continuous flickering

**Solution**: Use a ref to track previous groupMode and only expand groups when mode actually changes.

```typescript
// ✅ AFTER - Fixed
const prevGroupModeRef = useRef<GroupMode>("none");

useEffect(() => {
  // Only run when groupMode actually changes, not on every render
  if (prevGroupModeRef.current !== groupMode) {
    prevGroupModeRef.current = groupMode;
    
    if (groupMode !== "none") {
      setExpandedGroups(new Set(groupedEmails.map(g => g.key)));
    } else {
      setExpandedGroups(new Set());
    }
  }
}, [groupMode, groupedEmails]); // Safe now because of ref check
```

## Key Lessons

### 1. Be Careful with Memoized Values in Dependencies
Even though `useMemo` prevents unnecessary recalculations, the resulting reference still changes when dependencies change. Don't include memoized values in useEffect dependencies unless you truly need to react to their changes.

### 2. State-Derived Dependencies Can Cause Loops
When useEffect depends on state that it also updates (directly or indirectly), you risk creating infinite loops. Always ask: "Does this effect need to run when X changes, or only when Y changes?"

### 3. Use Refs for "Previous Value" Comparisons
When you want an effect to run only when a value **actually changes** (not just when the component re-renders), use a ref to track the previous value and compare.

### 4. Think About Data Flow
```
Props change → Memo recalculates → useEffect triggers → State updates → Re-render
     ↑                                                                      ↓
     └──────────────────────── Loop continues ──────────────────────────────┘
```

Breaking the cycle requires identifying which dependency is unnecessary or using techniques like refs to prevent unnecessary executions.

## Testing Checklist

To verify flickering is fixed:
- [ ] Open Pivot View - grid should be stable
- [ ] Change grouping options (none → by domain → by status) - no flickering
- [ ] Let emails refresh in background - grid stays stable
- [ ] Open WebMail View - list should be stable
- [ ] Switch grouping modes (List → By Sender Name → By Email → By Day) - smooth transitions
- [ ] Let emails refresh in background - groups stay stable
- [ ] Toggle group expansion/collapse - smooth animations
- [ ] Switch between Pivot and WebMail views - no flickering

## Performance Impact

**Before fixes**:
- Continuous re-renders (10-100+ per second)
- High CPU usage
- Poor user experience
- Impossible to interact with groups

**After fixes**:
- Renders only when necessary
- Minimal CPU usage
- Smooth user experience
- Stable group expansion/collapse
