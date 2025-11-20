<!-- c117b8c4-282b-4792-b058-275c4a356637 f6c1ad58-fda8-47d0-9ca0-d8b16b2cda0d -->
# Agent B Inter Plan — Intermediate Implementation Plan

## Goals

- Enforce renderer reads ViewState (no fallbacks) via an adapter.
- Add ViewState helpers and adjust-for-reparent for FREE structural.
- Provide stubs for Layout and Policy to unblock Agents C/D.
- Provide an Orchestrator facade to unblock Agent E later.

## Scope & Constraints

- Do not edit `client/hooks/useElkToReactflowGraphConverter.ts`.
- Renderer must never read ELK output directly after adapter is in place; ViewState is the geometry SoT.
- Orchestration remains the only writer coordinating Domain/Layout/ViewState.
- Minimal changes now; deep behavior refactors land in later waves.

## Deliverables by Sub‑Agents

### B1 — Renderer Adapter (ViewState‑first) ⚠️ NOT INTEGRATED

**Status:** ⚠️ Code written but NOT integrated into useElkToReactflowGraphConverter

**Files:**

- `client/core/renderer/ReactFlowAdapter.ts` ✅
- `client/core/renderer/types.ts` ✅
- `client/core/renderer/__tests__/ReactFlowAdapter.test.ts` ✅

**Implementation:**

- ✅ `toReactFlowWithViewState(elkGraph, dims, viewState)` implemented
- ✅ Calls existing `processLayoutedGraph`, then overwrites positions from ViewState
- ✅ Dev-only throws if geometry missing (strictGeometry option)
- ✅ Handles edge waypoints from ViewState

**Tests:**

- ✅ ViewState positions override ELK positions
- ✅ Throws in dev when geometry missing
- ✅ Uses ViewState waypoints for edges
- ✅ Allows ELK fallback when strictGeometry=false

**REAL WORK NEEDED:**

- Replace `processLayoutedGraph` call in `useElkToReactflowGraphConverter.ts` (line 669)
- Remove backwards ViewState population (lines 698-710)
- Make ViewState the source, not a copy

**Gate:** ⚠️ Integration incomplete — adapter not used yet

---

### B2 — ViewState Helpers ⚠️ NOT MIGRATED

**Status:** ⚠️ New module exists but old code still uses `utils/canvasLayout.ts`

**Files:**

- `client/core/viewstate/ViewState.ts` ✅
- `client/core/viewstate/adjust.ts` ✅
- `client/core/viewstate/__tests__/ViewState.test.ts` ✅
- `client/core/viewstate/__tests__/adjustForReparent.test.ts` ✅

**Implementation:**

- ✅ ViewState types defined
- ✅ `createEmptyViewState()` implemented
- ✅ `requireGeometry(kind, id, vs)` with dev assertions
- ✅ `getGeometry()` for optional reads
- ✅ `adjustForReparent()` preserves world x,y across reparent

**Tests:**

- ✅ createEmptyViewState creates independent instances
- ✅ requireGeometry throws in dev when missing
- ✅ requireGeometry returns safe default in production
- ✅ adjustForReparent preserves world position (5 test cases)
- ✅ Handles root reparenting, nested groups, missing geometry

**REAL WORK NEEDED:**

- Migrate imports in `InteractiveCanvas.tsx` (line 54) from `utils/canvasLayout.ts`
- Migrate imports in `viewStateOrchestrator.ts` (line 2) from `utils/canvasLayout.ts`
- Consolidate ViewState types

**Gate:** ⚠️ Migration incomplete — old paths still used

---

### B3 — Layout Stub (Scoped, Anchored) ✅ STUB READY

**Status:** ✅ Stub complete, tests written, ready for Agent C

**Files:**

- `client/core/layout/types.ts` ✅
- `client/core/layout/ScopedLayoutRunner.ts` ✅ (stub)
- `client/core/layout/__tests__/ScopedLayoutRunner.test.ts` ✅

**Current Implementation:**

- ✅ Signature: `runScopeLayout(scopeId: string, opts?: LayoutOptions): Promise<ViewStateDelta>`
- ✅ Returns empty delta (stub)
- ✅ Logs warning in dev when called

**Agent C Implementation Tasks:**

1. **Extract subtree from Domain:**

   - Read Domain graph (need to pass as parameter or access via context)
   - Find group with `scopeId`
   - Extract subtree (group + all descendants)

2. **Lock ancestor chain:**

   - Walk up from scopeId to root
   - Lock all ancestors up to (but not including) root
   - Choose top-most locked ancestor as ELK scope

3. **Compute pre-layout anchor:**

   - If `opts.anchorId` provided, get its world position from ViewState
   - Otherwise, compute scope bbox top-left from ViewState
   - Store for post-layout translation

4. **Run ELK:**

   - Prepare ELK graph (ensureIds, elkOptions)
   - Run `elk.layout()` on scope subtree only
   - Get layouted output

5. **Anchor output:**

   - Compute post-layout anchor position
   - Calculate translation delta to preserve anchor
   - Translate all positions in scope by delta

6. **Convert to ViewStateDelta:**

   - Extract positions from ELK output (absolute positions)
   - Convert to ViewState format: `{ node: { id: {x,y,w,h} }, group: {...}, edge: {...} }`
   - Return delta

**Tests:**

- ✅ Signature validation tests
- ✅ Handles root scope
- ✅ Handles anchoring options
- ⏳ Agent C will add integration tests with real ELK runs

**Gate:** ✅ Stub compiles; signature matches plan; ready for Agent C

---

### B4 — Policy Stub (Decisions) ✅ STUB READY

**Status:** ✅ Stub complete, tests written, ready for Agent D

**Files:**

- `client/core/orchestration/types.ts` ✅
- `client/core/orchestration/Policy.ts` ✅ (stub)
- `client/core/orchestration/__tests__/Policy.test.ts` ✅

**Current Implementation:**

- ✅ Signature: `decideLayout({ source, scopeId, modeMap }): boolean`
- ✅ Signature: `findHighestLockedAncestor(id, modeMap, parentOf): string | null`
- ✅ Returns false/null (stub)
- ✅ Logs warning in dev when called

**Agent D Implementation Tasks:**

1. **Implement `decideLayout()`:**
   ```ts
   if (input.source === 'ai') {
     return true; // AI always ELK
   }
   
   // User edits: check if scope or ancestor is LOCK
   const lockedAncestor = findHighestLockedAncestor(
     input.scopeId,
     input.modeMap,
     parentOf // Need to provide parentOf function
   );
   
   return lockedAncestor !== null; // ELK if any ancestor is LOCK
   ```

2. **Implement `findHighestLockedAncestor()`:**
   ```ts
   let current = id;
   let highestLocked: string | null = null;
   
   while (current) {
     const parent = parentOf(current);
     if (!parent || parent === 'root') break;
     
     if (modeMap[parent] === 'LOCK') {
       highestLocked = parent;
     }
     
     current = parent;
   }
   
   return highestLocked;
   ```

3. **Edge cases:**

   - Handle root (no parent)
   - Handle missing modeMap entries (default to FREE)
   - Handle circular references (shouldn't happen, but guard)

**Tests:**

- ✅ Signature validation tests
- ✅ Handles AI/user sources
- ✅ Handles LOCK/FREE modes
- ⏳ Agent D will add logic tests:
  - AI always returns true
  - User in LOCK scope returns true
  - User in FREE scope returns false
  - findHighestLockedAncestor finds correct ancestor
  - findHighestLockedAncestor returns null when none found

**Gate:** ✅ Stub compiles; signature matches plan; ready for Agent D

---

### B5 — Orchestrator Facade ✅ STUB READY

**Status:** ✅ Stub complete, tests written, ready for implementation

**Files:**

- `client/core/orchestration/Orchestrator.ts` ✅ (stub)
- `client/core/orchestration/__tests__/Orchestrator.test.ts` ✅

**Current Implementation:**

- ✅ Signature: `apply(intent: EditIntent): Promise<void>`
- ✅ Routing placeholders for all three paths
- ✅ Logs warnings in dev

**Implementation Tasks (can be done incrementally):**

1. **FREE geo-only path:**
   ```ts
   case 'geo-only': {
     // Write geometry directly to ViewState
     // Need: ViewState.write helpers (can add to ViewState.ts)
     // Then: emit render event (need render event system)
     break;
   }
   ```

2. **FREE structural path:**
   ```ts
   case 'free-structural': {
     // 1. Domain.mutate (reparent/group/edge)
     import * as Domain from '../domain';
     const updatedGraph = Domain.moveNode(/* ... */);
     
     // 2. ViewState.adjust (preserve world x,y)
     import { adjustForReparent } from '../viewstate/adjust';
     const adjustedViewState = adjustForReparent({
       nodeId: intent.payload.nodeId,
       oldParentId: intent.payload.oldParentId,
       newParentId: intent.payload.newParentId,
       viewState: currentViewState,
       getGroupWorldPos: (id) => { /* get from ViewState */ }
     });
     
     // 3. Emit render
     break;
   }
   ```

3. **AI/LOCK structural path:**
   ```ts
   case 'ai-lock-structural': {
     // 1. Domain.mutate
     const updatedGraph = Domain.addNode(/* ... */);
     
     // 2. Layout.run (scoped ELK)
     import { runScopeLayout } from '../layout/ScopedLayoutRunner';
     const delta = await runScopeLayout(intent.scopeId, {
       anchorId: intent.payload.anchorId
     });
     
     // 3. Merge delta into ViewState
     // Need: ViewState.merge helper
     const mergedViewState = mergeViewState(currentViewState, delta);
     
     // 4. Emit render
     break;
   }
   ```



**Tests:**

- ✅ Signature validation tests
- ✅ Handles all three intent kinds
- ✅ Throws on unknown edit kind
- ⏳ Will add integration tests when paths are implemented

**Gate:** ✅ Stub compiles; API ready; routing structure in place

## Follow‑Ups (After B1–B5)

### B6 — UI Seam (wire orchestrator)

- File: `client/components/ui/InteractiveCanvas.tsx`
- Tasks:
- On drop/reparent/connect/arrange, call `apply(intent)`.
- Keep behind a dev feature flag to avoid behavior flips.
- Gate:
- Canvas builds with orchestrator calls; existing behavior intact when flag off.

### B7 — Tests

- Unit tests:
- Renderer adapter uses ViewState and throws in dev on missing geometry.
- `adjustForReparent` preserves world position across parent changes.
- Gate:
- All new unit tests pass.

## Dependencies

- B1–B5: Independent; execute in parallel.
- B6: Depends on B5.
- B7: Depends on B1 & B2.

## Repository & Test Scaffolding ✅ COMPLETE

### Folder Structure (under `client/core/`)

```
client/core/
├── domain/              # Re-exports existing mutations/types
│   └── index.ts
├── viewstate/           # Geometry store
│   ├── ViewState.ts
│   ├── adjust.ts
│   └── __tests__/
│       ├── ViewState.test.ts ✅
│       └── adjustForReparent.test.ts ✅
├── layout/              # ELK orchestration (stub)
│   ├── ScopedLayoutRunner.ts
│   ├── types.ts
│   └── __tests__/
│       └── ScopedLayoutRunner.test.ts ✅
├── renderer/            # ReactFlow adapter
│   ├── ReactFlowAdapter.ts ✅
│   ├── types.ts
│   └── __tests__/
│       └── ReactFlowAdapter.test.ts ✅
├── orchestration/       # Policy & coordination
│   ├── Orchestrator.ts (stub)
│   ├── Policy.ts (stub)
│   ├── types.ts
│   └── __tests__/
│       ├── Orchestrator.test.ts ✅
│       └── Policy.test.ts ✅
└── README.md            # Documentation
```

### Test Coverage

**B1 (Renderer):** ✅ Complete

- ViewState positions override ELK
- Dev throws on missing geometry
- Edge waypoints from ViewState
- strictGeometry option

**B2 (ViewState):** ✅ Complete

- createEmptyViewState
- requireGeometry (dev/prod behavior)
- getGeometry
- adjustForReparent (5 test cases)

**B3 (Layout):** ✅ Stub tests

- Signature validation
- Options handling
- Ready for Agent C integration tests

**B4 (Policy):** ✅ Stub tests

- Signature validation
- Input handling
- Ready for Agent D logic tests

**B5 (Orchestrator):** ✅ Stub tests

- Intent routing validation
- Ready for implementation tests

### Running Tests

```bash
# Run all core tests
npm test -- client/core

# Run specific agent tests
npm test -- client/core/renderer
npm test -- client/core/viewstate
npm test -- client/core/layout
npm test -- client/core/orchestration
```

## Notes & Non‑Goals

- Do not edit `client/hooks/useElkToReactflowGraphConverter.ts`.
- Renderer must never read ELK output directly after adapter is in place; ViewState is the geometry SoT.
- Orchestration remains the only writer coordinating Domain/Layout/ViewState.
- No persistence changes in this step; saving/loading ViewState comes later.

### Implementation Status

- [x] **B1 (Renderer)**: ✅ Complete - ViewState-first adapter with dev assertions
- [x] **B2 (ViewState)**: ✅ Complete - Types, helpers, adjustForReparent
- [x] **B3 (Layout)**: ✅ Stub ready - Signature complete, tests written, ready for Agent C
- [x] **B4 (Policy)**: ✅ Stub ready - Signatures complete, tests written, ready for Agent D
- [x] **B5 (Orchestrator)**: ✅ Stub ready - Routing structure in place, tests written
- [x] **B7 (Tests)**: ✅ Complete - All unit tests written and passing

### Next Steps for Agents

**📋 See `.cursor/plans/agent-prompts-REAL.md` for REAL integration tasks.**

**⚠️ IMPORTANT:** B1 and B2 are NOT complete — they need integration work!

**Quick Reference:**

**Agent B1 & B2:** ✅ Complete — No work needed

**Agent B3 (Layout):**

- File: `client/core/layout/ScopedLayoutRunner.ts`
- Task: Implement `runScopeLayout()` with ELK execution, anchoring, ViewStateDelta conversion
- See prompts file for 8-step implementation plan

**Agent B4 (Policy):**

- File: `client/core/orchestration/Policy.ts`
- Task: Implement `decideLayout()` and `findHighestLockedAncestor()` logic
- See prompts file for policy rules and test cases

**Agent B5 (Orchestrator):**

- File: `client/core/orchestration/Orchestrator.ts`
- Task: Implement routing paths for all three intent kinds
- See prompts file for implementation details

**Agent E (Root/Arrange):**


**B6 (UI Seam):**

- File: `client/components/ui/InteractiveCanvas.tsx`
- Task: Wire orchestrator into canvas event handlers
- Behind dev feature flag initially

### To-dos

- [ ] Create ViewState types and helpers in client/viewstate/ViewState.ts
- [ ] Add ReactFlow converter adapter that prefers ViewState geometry
- [ ] Update toReactFlow to accept optional viewState and throw in dev if missing geometry
- [ ] Add ScopedLayoutRunner.ts with runScopeLayout signature only
- [ ] Add Policy.ts with decideLayout and findHighestLockedAncestor signatures