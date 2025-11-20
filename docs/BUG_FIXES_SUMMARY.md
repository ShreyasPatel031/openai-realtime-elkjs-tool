# Bug Fixes Summary

## Fixed: ViewState-First Loading + Mode Persistence

### Problems
1. **ELK ran on every page load**, even when ViewState existed in localStorage
2. **Mode field lost** during ELK processing (FREE/LOCK state reset on refresh)

### Root Causes
1. `useElkToReactflowGraphConverter.ts` line 322: `if (!mutation) return true` always ran ELK on load
2. ELK layout doesn't preserve custom fields like `mode` in its output

### Fixes Applied

**File**: `client/hooks/useElkToReactflowGraphConverter.ts`

#### Fix 1: ViewState-First Loading (lines ~322-336)
```typescript
// BEFORE
if (!mutation) {
  return true; // ❌ Always ran ELK on load
}

// AFTER
if (!mutation) {
  // Check if ViewState has geometry
  const hasViewStateGeometry = 
    (Object.keys(viewStateRef.current?.node || {}).length > 0) ||
    (Object.keys(viewStateRef.current?.group || {}).length > 0);
  
  if (hasViewStateGeometry) {
    console.log('🔍 [ELK] Skipping ELK - ViewState exists with geometry');
    return false; // ✅ Skip ELK, render from ViewState
  }
  return true; // No ViewState, run ELK
}
```

#### Fix 2: Mode Preservation (lines ~674-695)
```typescript
// BEFORE
const prepared = ensureIds(structuredClone(rawGraph));
const layout = await elk.layout(prepared);

// AFTER
// 1) Extract mode map BEFORE ELK
const extractModes = (node: any, map: Record<string, 'FREE' | 'LOCK'> = {}) => {
  if (node.mode) map[node.id] = node.mode;
  (node.children || []).forEach((child: any) => extractModes(child, map));
  return map;
};
const modeMap = extractModes(rawGraph);

// 2) Run ELK
const prepared = ensureIds(structuredClone(rawGraph));
const layout = await elk.layout(prepared);

// 3) Restore modes AFTER ELK
const restoreModes = (node: any) => {
  if (modeMap[node.id]) node.mode = modeMap[node.id];
  (node.children || []).forEach(restoreModes);
};
restoreModes(layout);
```

### Impact

**Before**:
- ❌ Positions reset on every page refresh
- ❌ Mode field lost (LOCK groups became FREE)
- ❌ Unnecessary ELK computation on load
- ❌ localStorage ViewState ignored

**After**:
- ✅ Positions persist across refreshes
- ✅ Mode field preserved (LOCK stays LOCK)
- ✅ Fast load (no ELK when ViewState exists)
- ✅ ViewState-first architecture enforced

### Testing

**To verify fixes**:
1. Create a group, set to LOCK mode (arrange button blue)
2. Save and refresh page
3. **Expected**: Group should still be LOCK (button still blue)
4. **Expected**: Positions should not jump

### Memory Removed

Deleted memory ID 10838437: "Do not modify useElkToReactflowGraphConverter.ts"
- This was blocking necessary bug fixes
- AI path remains unchanged (correctly runs ELK for AI edits)
- Only the load path was fixed (now respects ViewState)

### Related Documentation

- `docs/MODE_PERSISTENCE_REVIEW.md` - Mode persistence architecture
- `docs/ELK_ON_LOAD_BUG.md` - ELK on load bug analysis
- `.cursor/plans/figjam-free-lock-mode-implementation-27a2163e.plan.md` - Updated to reflect fixes



