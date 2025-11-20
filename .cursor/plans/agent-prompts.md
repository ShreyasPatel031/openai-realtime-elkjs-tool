# Agent Prompts — Agent B Inter Plan

## Agent B1 — Renderer Adapter (ViewState-first)

**Status:** ✅ COMPLETE — No work needed

**What's Done:**
- ✅ `client/core/renderer/ReactFlowAdapter.ts` — ViewState-first adapter implemented
- ✅ `client/core/renderer/types.ts` — Type definitions
- ✅ `client/core/renderer/__tests__/ReactFlowAdapter.test.ts` — All tests passing

**Verification:**
```bash
npm test -- client/core/renderer
```

**Key Implementation:**
- Adapter calls existing `processLayoutedGraph`, then overwrites all node positions from ViewState
- Dev mode throws if geometry missing (enforces no-fallback contract)
- Edge waypoints read from ViewState when available

**No action required** — Implementation complete.

---

## Agent B2 — ViewState Helpers

**Status:** ✅ COMPLETE — No work needed

**What's Done:**
- ✅ `client/core/viewstate/ViewState.ts` — Types, createEmpty, requireGeometry, getGeometry
- ✅ `client/core/viewstate/adjust.ts` — adjustForReparent with world position preservation
- ✅ `client/core/viewstate/__tests__/ViewState.test.ts` — All tests passing
- ✅ `client/core/viewstate/__tests__/adjustForReparent.test.ts` — All tests passing

**Verification:**
```bash
npm test -- client/core/viewstate
```

**Key Implementation:**
- `requireGeometry()` throws in dev when missing (no fallbacks)
- `adjustForReparent()` preserves world x,y across reparent operations
- Handles root reparenting, nested groups, missing geometry gracefully

**No action required** — Implementation complete.

---

## Agent B3 — Layout Stub (Scoped, Anchored)

**Status:** 🔄 STUB READY — Agent C to implement

**Prompt for Agent C:**

You are implementing the scoped layout runner that executes ELK on a specific group scope with anchoring.

**File to Modify:**
- `client/core/layout/ScopedLayoutRunner.ts`

**Current State:**
- Signature exists: `runScopeLayout(scopeId: string, opts?: LayoutOptions): Promise<ViewStateDelta>`
- Returns empty delta (stub)
- Tests validate signature

**Your Tasks:**

1. **Update function signature to accept Domain graph:**
   ```ts
   export async function runScopeLayout(
     scopeId: string,
     graph: RawGraph,  // ADD: Domain graph parameter
     viewState: ViewState,  // ADD: Current ViewState for anchoring
     opts?: LayoutOptions
   ): Promise<ViewStateDelta>
   ```

2. **Extract subtree from Domain:**
   - Find group with `scopeId` in graph
   - Extract subtree (group + all descendants)
   - Use existing helpers from `client/components/graph/utils/elk/ids.ts` if needed

3. **Lock ancestor chain:**
   - Walk up from `scopeId` to root using parent relationships
   - Choose top-most locked ancestor (under root) as ELK scope
   - If no locked ancestor, use `scopeId` itself

4. **Compute pre-layout anchor:**
   - If `opts.anchorId` provided: get world position from ViewState
   - Otherwise: compute scope bbox top-left from ViewState
   - Store anchor position for post-layout translation

5. **Run ELK on scope:**
   - Use existing ELK instance (import from `useElkToReactflowGraphConverter.ts` or create new)
   - Prepare graph with `ensureIds()` and `elkOptions`
   - Run `elk.layout()` on scope subtree only (not whole graph)
   - Get layouted output

6. **Anchor output:**
   - Compute post-layout anchor position from ELK output
   - Calculate translation delta: `{ dx: anchorPre.x - anchorPost.x, dy: anchorPre.y - anchorPost.y }`
   - Translate all positions in scope by delta

7. **Convert to ViewStateDelta:**
   - Extract absolute positions from ELK output
   - Convert to ViewState format:
     ```ts
     {
       node: { [id]: { x, y, w, h } },
       group: { [id]: { x, y, w, h } },
       edge: { [id]: { waypoints?: [...] } }
     }
     ```
   - Return delta (only changed geometry)

8. **Auto-fit group frames:**
   - After ELK, compute bbox of children for each group
   - Update group sizes in delta

**Dependencies:**
- Import `RawGraph` from `../../components/graph/types`
- Import `ensureIds` from `../../components/graph/utils/elk/ids`
- Import ELK options from `../../components/graph/utils/elk/elkOptions`
- Use existing ELK instance or create new: `import ELK from "elkjs/lib/elk.bundled.js"`

**Tests to Add:**
- Integration test: ELK runs on scope, not whole graph
- Integration test: Anchor position preserved (top-left doesn't jump)
- Integration test: ViewStateDelta contains correct geometry
- Integration test: Group frames auto-fit to children

**Acceptance Criteria:**
- ✅ ELK runs only on specified scope (not whole graph)
- ✅ Anchor top-left preserved (no jumping)
- ✅ Returns ViewStateDelta with geometry for all entities in scope
- ✅ Group frames auto-fit to children
- ✅ All tests pass

**Run Tests:**
```bash
npm test -- client/core/layout
```

---

## Agent B4 — Policy Stub (Decisions)

**Status:** 🔄 STUB READY — Agent D to implement

**Prompt for Agent D:**

You are implementing the layout policy that decides when ELK should run based on source (AI/user) and group modes (FREE/LOCK).

**File to Modify:**
- `client/core/orchestration/Policy.ts`

**Current State:**
- Signatures exist for `decideLayout()` and `findHighestLockedAncestor()`
- Return false/null (stub)
- Tests validate signatures

**Your Tasks:**

1. **Implement `decideLayout()`:**
   ```ts
   export function decideLayout(input: DecideLayoutInput): boolean {
     // AI edits: always run ELK
     if (input.source === 'ai') {
       return true;
     }
     
     // User edits: check if scope or ancestor is LOCK
     // Need to provide parentOf function - you'll need to build parent map from Domain
     // For now, assume parentOf is passed or build from modeMap keys
     
     const lockedAncestor = findHighestLockedAncestor(
       input.scopeId,
       input.modeMap,
       buildParentOf(input.modeMap) // Helper to build parentOf from modeMap
     );
     
     return lockedAncestor !== null; // ELK if any ancestor is LOCK
   }
   ```

2. **Implement `findHighestLockedAncestor()`:**
   ```ts
   export function findHighestLockedAncestor(
     id: string,
     modeMap: ModeMap,
     parentOf: (id: string) => string | null
   ): string | null {
     let current: string | null = id;
     let highestLocked: string | null = null;
     
     // Walk up to root
     while (current) {
       const parent = parentOf(current);
       if (!parent || parent === 'root') break;
       
       // Check if parent is LOCK
       if (modeMap[parent] === 'LOCK') {
         highestLocked = parent; // Update to most recent LOCK ancestor
       }
       
       current = parent;
     }
     
     return highestLocked;
   }
   ```

3. **Helper function (if needed):**
   - You may need to build `parentOf` function from Domain graph
   - Or accept it as parameter (orchestrator will provide)
   - For testing, create mock parentOf functions

**Policy Rules (from spec §3):**
- AI edits: **always** run ELK
- User edits in LOCK scope: run ELK (on highest locked ancestor)
- User edits in FREE scope: **no ELK** (unless explicit arrange)

**Tests to Add:**
```ts
describe('decideLayout logic', () => {
  it('returns true for AI source', () => {
    expect(decideLayout({ source: 'ai', scopeId: 'group-1', modeMap: {} })).toBe(true);
  });
  
  it('returns true for user in LOCK scope', () => {
    expect(decideLayout({
      source: 'user',
      scopeId: 'node-1',
      modeMap: { 'group-1': 'LOCK' }
    })).toBe(true);
  });
  
  it('returns false for user in FREE scope', () => {
    expect(decideLayout({
      source: 'user',
      scopeId: 'node-1',
      modeMap: { 'group-1': 'FREE' }
    })).toBe(false);
  });
});

describe('findHighestLockedAncestor', () => {
  it('finds LOCK ancestor in chain', () => {
    const parentOf = (id: string) => {
      if (id === 'node-1') return 'group-1';
      if (id === 'group-1') return 'group-2';
      return null;
    };
    
    const result = findHighestLockedAncestor(
      'node-1',
      { 'group-2': 'LOCK', 'group-1': 'FREE' },
      parentOf
    );
    
    expect(result).toBe('group-2');
  });
  
  it('returns null when no LOCK ancestor', () => {
    const parentOf = (id: string) => id === 'node-1' ? 'group-1' : null;
    const result = findHighestLockedAncestor(
      'node-1',
      { 'group-1': 'FREE' },
      parentOf
    );
    expect(result).toBeNull();
  });
});
```

**Acceptance Criteria:**
- ✅ AI source always returns true
- ✅ User in LOCK scope returns true
- ✅ User in FREE scope returns false
- ✅ findHighestLockedAncestor finds correct ancestor
- ✅ findHighestLockedAncestor returns null when none found
- ✅ All tests pass

**Run Tests:**
```bash
npm test -- client/core/orchestration
```

---

## Agent B5 — Orchestrator Facade

**Status:** 🔄 STUB READY — Implementation needed

**Prompt for Agent B5:**

You are implementing the orchestrator that routes edit intents to the correct sequence of operations (Domain → Layout → ViewState → Render).

**File to Modify:**
- `client/core/orchestration/Orchestrator.ts`

**Current State:**
- Signature exists for `apply()`
- Routing placeholders with TODO comments
- Tests validate signatures

**Your Tasks:**

1. **Add ViewState merge helper (if needed):**
   - Add to `client/core/viewstate/ViewState.ts`:
     ```ts
     export function mergeViewState(
       base: ViewState,
       delta: Partial<ViewState>
     ): ViewState {
       return {
         node: { ...base.node, ...delta.node },
         group: { ...base.group, ...delta.group },
         edge: { ...base.edge, ...delta.edge },
       };
     }
     ```

2. **Add ViewState write helpers (if needed):**
   - Add to `client/core/viewstate/ViewState.ts`:
     ```ts
     export function writeNodeGeometry(
       viewState: ViewState,
       nodeId: string,
       geometry: { x: number; y: number; w?: number; h?: number }
     ): ViewState {
       return {
         ...viewState,
         node: { ...viewState.node, [nodeId]: geometry },
       };
     }
     
     // Similar for writeGroupGeometry, writeEdgeGeometry
     ```

3. **Implement FREE geo-only path:**
   ```ts
   case 'geo-only': {
     // Write geometry directly to ViewState
     const { nodeId, x, y, w, h } = intent.payload;
     const updatedViewState = writeNodeGeometry(currentViewState, nodeId, { x, y, w, h });
     
     // Emit render (need render event system - for now, just update)
     // TODO: Emit render event when event system is ready
     break;
   }
   ```

4. **Implement FREE structural path:**
   ```ts
   case 'free-structural': {
     // 1. Domain.mutate
     import * as Domain from '../domain';
     const { nodeId, oldParentId, newParentId } = intent.payload;
     const updatedGraph = Domain.moveNode(nodeId, newParentId, currentGraph);
     
     // 2. ViewState.adjust (preserve world x,y)
     import { adjustForReparent } from '../viewstate/adjust';
     const getGroupWorldPos = (groupId: string) => {
       const geom = currentViewState.group?.[groupId];
       return geom ? { x: geom.x, y: geom.y } : undefined;
     };
     
     const adjustedViewState = adjustForReparent({
       nodeId,
       oldParentId,
       newParentId,
       viewState: currentViewState,
       getGroupWorldPos,
     });
     
     // 3. Emit render
     // TODO: Emit render event
     break;
   }
   ```

5. **Implement AI/LOCK structural path:**
   ```ts
   case 'ai-lock-structural': {
     // 1. Domain.mutate
     import * as Domain from '../domain';
     const updatedGraph = Domain.addNode(/* ... */);
     
     // 2. Layout.run (scoped ELK)
     import { runScopeLayout } from '../layout/ScopedLayoutRunner';
     const delta = await runScopeLayout(
       intent.scopeId,
       updatedGraph,
       currentViewState,
       { anchorId: intent.payload.anchorId }
     );
     
     // 3. Merge delta into ViewState
     import { mergeViewState } from '../viewstate/ViewState';
     const mergedViewState = mergeViewState(currentViewState, delta);
     
     // 4. Emit render
     // TODO: Emit render event
     break;
   }
   ```


**Note:** You'll need to handle:
- Access to current graph and viewState (may need to pass as parameters or use context)
- Render event emission (can be placeholder for now)
- Error handling for each path

**Tests to Add:**
- Integration test: geo-only path writes to ViewState
- Integration test: free-structural path mutates Domain and adjusts ViewState
- Integration test: ai-lock-structural path runs layout and merges delta

**Acceptance Criteria:**
- ✅ All three intent paths implemented
- ✅ ViewState helpers available (merge, write)
- ✅ All tests pass

**Run Tests:**
```bash
npm test -- client/core/orchestration
```

---

## Summary

**B1 & B2:** ✅ Complete — No work needed

**B3 (Agent C):** Implement `runScopeLayout()` with ELK execution, anchoring, and ViewStateDelta conversion

**B4 (Agent D):** Implement `decideLayout()` and `findHighestLockedAncestor()` policy logic

**B5 (Agent B5):** Implement orchestrator routing paths and ViewState helpers

All agents can work in parallel. Tests are written and ready to validate implementations.



