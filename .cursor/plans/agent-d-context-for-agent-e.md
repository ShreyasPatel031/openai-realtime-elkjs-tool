# Agent D → Agent E Context: Policy Gate Implementation

## Overview

Agent D has implemented the **Policy Gate** module (`client/core/orchestration/Policy.ts`) with pure decision logic functions. These functions determine when ELK should run, which ancestors need locking, and what scope to use for layout.

## Key Functions Available

### 1. `decideLayout(input: DecideLayoutInput): boolean`
**Purpose**: Determines if ELK should run for a given edit.

**Input**:
```typescript
{
  source: 'ai' | 'user',
  scopeId: string,
  modeMap: ModeMap,  // Record<string, 'FREE' | 'LOCK'>
  parentOf: (id: string) => string | null
}
```

**Returns**: `true` if ELK should run, `false` otherwise.

**Policy**:
- AI edits → always `true` (AI always triggers ELK)
- User edits in LOCK scope → `true`
- User edits in FREE scope → `false`

**Example**:
```typescript
import { decideLayout, buildModeMap, buildParentOf } from '../core/orchestration/Policy';

const modeMap = buildModeMap(graph);
const parentOf = buildParentOf(graph);
const shouldRun = decideLayout({
  source: 'user',
  scopeId: 'group-123',
  modeMap,
  parentOf
});
```

### 2. `findHighestLockedAncestor(id: string, modeMap: ModeMap, parentOf: (id: string) => string | null): string | null`
**Purpose**: Finds the highest (closest to root) locked ancestor.

**Returns**: Locked ancestor ID or `null` if none found.

### 3. `getAncestorChainToLock(scopeId: string, parentOf: (id: string) => string | null): string[]`
**Purpose**: Returns array of ancestor IDs that need to be locked (up to but not including root).

**Returns**: Array of IDs in order from scopeId to root (exclusive).

**Note**: Root cannot be locked, so this stops before root.

### 4. `findTopMostLockedAncestor(scopeId: string, modeMap: ModeMap, parentOf: (id: string) => string | null): string | null`
**Purpose**: Finds the top-most locked ancestor after chain locking (the scope for ELK).

**Returns**: Top-most locked ancestor ID (the scope to pass to ScopedLayoutRunner).

### 5. `shouldAutoLockForAI(scopeId: string, modeMap: ModeMap): boolean`
**Purpose**: Determines if a FREE scope should be auto-locked when AI targets it.

**Returns**: `true` if scope should be auto-locked (it's FREE or not in modeMap).

### 6. `buildModeMap(graph: ElkGraphNode): ModeMap`
**Purpose**: Extracts mode from all groups in a graph.

**Returns**: `Record<string, 'FREE' | 'LOCK'>` with all group IDs and their modes (defaults to 'FREE' if not set).

**Note**: Only groups (nodes with children) have modes. Leaf nodes are not included.

### 7. `buildParentOf(graph: ElkGraphNode): (id: string) => string | null`
**Purpose**: Builds a parentOf lookup function from a graph structure.

**Returns**: Function that returns parent ID for a given ID, or `null` if root/no parent.

## Important Constraints for Agent E

### Root Cannot Be Locked
- Root (`'root'` or graph root ID) **cannot** be locked
- `getAncestorChainToLock()` automatically stops before root
- Root is always FREE mode

### Mode Persistence
- Mode changes (`LOCK`) must persist to domain graph
- Agent D's functions are **pure** - they don't modify state
- Agent E (or Orchestrator) must actually perform the mode mutations

### Integration Points

**For Root Lock Prevention**:
```typescript
// When user tries to toggle mode on root:
if (groupId === 'root' || groupId === graph.id) {
  // Disallow - show message or disable toggle
  return;
}
```

## Files Modified by Agent D

- ✅ `client/core/orchestration/Policy.ts` - All policy functions implemented
- ✅ `client/core/orchestration/__tests__/Policy.test.ts` - Comprehensive tests
- ✅ `client/core/orchestration/types.ts` - Updated `DecideLayoutInput` to include `parentOf`

## Files Agent E Should Modify

- Group mode toggle component - Prevent root from being locked

## Testing

All Policy functions have comprehensive unit tests. You can run:
```bash
npm test -- client/core/orchestration/__tests__/Policy.test.ts
```

## Dependencies

- **Agent A** (Indices): Not required - Agent D built `buildParentOf()` independently
- **No dependency on useElkToReactflowGraphConverter** - All functions are pure and independent

## Example Flow for Agent E

### Scenario: User tries to lock root
1. Prevent lock action
2. If confirmed:
   - Build modeMap and parentOf from current graph
   - Call `runScopeLayout('root', { anchorId: null })` (when Agent C completes)
   - Merge ViewState delta
   - Trigger render

### Scenario: User tries to lock root
1. Detect root ID (check if `groupId === 'root' || groupId === graph.id`)
2. Disallow toggle
3. Show message: "Root cannot be locked. Use 'Arrange All' to layout the entire canvas."

## Notes

- All functions are **pure** - no side effects
- Functions work independently of Agent C (no dependency on `runScopeLayout()`)
- Mode changes must be persisted by the Orchestrator or domain layer
- Root is always FREE - this is enforced by policy, not by mode field



