# Agent E Context - Root Rules

## Your Responsibilities (Wave 1, Agent E)

**Tasks:** phase1-root
- Ensure root cannot be locked

**Gate Criteria:**
- ✅ Root cannot be LOCK (UI prevents it, code enforces it)

---

## What Agent C Just Completed

**Agent C** implemented the **ScopedLayoutRunner** which you'll use:

### Location
- `client/core/layout/ScopedLayoutRunner.ts`

### Function Signature
```typescript
export async function runScopeLayout(
  scopeId: string,
  domainGraph: RawGraph,
  currentViewState: ViewState,
  opts?: LayoutOptions
): Promise<ViewStateDelta>
```

### What It Does
- Extracts subtree for `scopeId` from domain graph
- Computes pre-layout bbox top-left from ViewState (anchoring)
- Runs ELK on subtree only (not whole graph)
- Translates output to preserve anchor top-left
- Auto-fits group frame to children
- Returns ViewStateDelta with computed geometry

### Usage Example
```typescript
import { runScopeLayout } from '../core/layout/ScopedLayoutRunner';
import type { ViewState } from '../core/viewstate/ViewState';
import type { RawGraph } from '../components/graph/types/index';

// Run layout on root
const delta = await runScopeLayout(
  'root',              // scopeId
  domainGraph,         // Full domain graph
  currentViewState,    // Current ViewState for anchoring
  { anchorId: 'root' } // Optional: anchor specific node/group
);

// delta contains: { node: {...}, group: {...}, edge: {...} }
// Apply delta to ViewState (Agent D will handle this via Orchestrator)
```

---

## Current State of Relevant Files

### 1. ViewControls Component
**Location:** `client/components/ui/ViewControls.tsx`

**Current State:**
- Has Save, Export, Edit buttons
- Uses ViewModeContext for conditional rendering
- No root lock prevention logic

**What You Need to Add:**
- Root lock prevention validation


### 3. Root Lock Prevention

**Where to Add:**
- **UI Level:** In group mode toggle component (when it exists in Phase 5)
- **Code Level:** In mutations or wherever mode is set
- **Validation:** Add check that prevents `mode: 'LOCK'` on root

**Key Constraint from Spec:**
> **5.12 Root cannot be locked**

---

## Implementation Steps

### Step 1: Prevent Root from Being Locked

**Where:** Anywhere mode is set (mutations, UI toggles, etc.)

```typescript
// Example validation
function setGroupMode(groupId: string, mode: 'FREE' | 'LOCK'): void {
  if (groupId === 'root' && mode === 'LOCK') {
    throw new Error('Root cannot be locked.');
  }
  // ... set mode
}
```

**Files to Check:**
- `client/components/graph/mutations.ts` - If mode is set here
- Any group mode toggle UI (may not exist yet in Wave 1)
- ViewState orchestrator if it handles mode


---

## Key Files Reference

### Core Files
- `client/core/layout/ScopedLayoutRunner.ts` - ✅ Complete (Agent C)
- `client/core/orchestration/Orchestrator.ts` - ✅ Available
- `client/core/viewstate/ViewState.ts` - ✅ Types available

### UI Files
- `client/components/ui/ViewControls.tsx` - ✅ Available
- `client/components/ui/InteractiveCanvas.tsx` - Has ViewControls integration

### Graph Files
- `client/components/graph/types/index.ts` - RawGraph type
- `client/components/graph/mutations.ts` - May need root lock validation

### Context Files
- `client/contexts/ViewModeContext.tsx` - For conditional UI rendering

---

## Testing Requirements

### Unit Tests
- Test that root cannot be set to LOCK mode

### Manual Testing
- Attempt to set root to LOCK mode (should fail)
- Root remains FREE mode

---

## Integration with Other Agents

### Future Agents (Phase 5)
- Group mode toggle UI will need root lock prevention
- Your validation ensures root stays FREE

---

## Important Constraints

1. **Root is always FREE** - Never allow LOCK mode on root
2. **ViewState is source of truth** - All geometry goes through ViewState
3. **Don't modify useElkToReactflowGraphConverter** - That's off-limits per memory

---


---

## Success Criteria

✅ **Gate: Root cannot be LOCK**
- Code validation prevents root lock
- UI disables/prevents root lock toggle
- Error message if attempted

---

## Next Steps

1. Check `client/components/graph/mutations.ts` to see where mode is set
2. Check `client/components/ui/InteractiveCanvas.tsx` to see how mode is managed
3. Implement root lock prevention validation
4. Add UI validation (disable toggle if root)
5. Write tests
6. Test manually

Good luck! 🚀

