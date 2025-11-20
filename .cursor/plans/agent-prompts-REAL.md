# Agent Prompts — Agent B Inter Plan (REAL Tasks)

## Clarification

- **B1-B5**: Sub-agents of Agent B's intermediate plan
- **Agent C** (from main plan): Implements B3 (ScopedLayoutRunner)
- **Agent D** (from main plan): Implements B4 (Policy)
- **Agent E** (from main plan): Uses B5 (Orchestrator) for root lock prevention

---

## B1 — Renderer Adapter Integration (NOT DONE)

**Status:** ⚠️ Code exists but NOT INTEGRATED

**What Exists:**
- ✅ `client/core/renderer/ReactFlowAdapter.ts` — adapter code written
- ✅ Tests written

**What's Missing (REAL WORK):**
- ❌ `useElkToReactflowGraphConverter.ts` still calls `processLayoutedGraph` directly (line 669)
- ❌ ViewState is populated FROM ReactFlow nodes (line 698-710) — backwards! Should be source, not copy
- ❌ Adapter is never imported or used

**REAL Tasks:**

1. **Replace direct `processLayoutedGraph` call:**
   ```ts
   // OLD (line 669):
   const { nodes: rfNodes, edges: rfEdges } = processLayoutedGraph(layout, {...});
   
   // NEW:
   import { toReactFlowWithViewState } from '../core/renderer/ReactFlowAdapter';
   const { nodes: rfNodes, edges: rfEdges } = toReactFlowWithViewState(
     layout,
     dimensions,
     viewStateRef.current, // Use ViewState as SOURCE
     { strictGeometry: true }
   );
   ```

2. **Remove backwards ViewState population:**
   ```ts
   // DELETE lines 698-710 (populating ViewState from RF nodes)
   // ViewState should already exist from Layout/Orchestration
   ```

3. **Ensure ViewState exists before rendering:**
   - If ViewState is empty, initialize from ELK output ONCE
   - After that, ViewState is source of truth

**File:** `client/hooks/useElkToReactflowGraphConverter.ts`
**Lines:** 669-710

**Test:**
- After ELK runs, ViewState positions are used (not ELK positions)
- If ViewState missing, dev throws error
- Positions persist after ELK runs

---

## B2 — ViewState Migration (NOT DONE)

**Status:** ⚠️ New module exists but old code still used

**What Exists:**
- ✅ `client/core/viewstate/ViewState.ts` — new module
- ✅ `client/core/viewstate/adjust.ts` — adjustForReparent
- ✅ Tests written

**What's Missing (REAL WORK):**
- ❌ `InteractiveCanvas.tsx` still imports from `utils/canvasLayout.ts` (line 54)
- ❌ `viewStateOrchestrator.ts` still imports from `utils/canvasLayout.ts` (line 2)
- ❌ Old ViewState type in `utils/canvasLayout.ts` still used

**REAL Tasks:**

1. **Migrate imports in InteractiveCanvas.tsx:**
   ```ts
   // OLD (line 54):
   import { sanitizeStoredViewState, restoreNodeVisuals, createEmptyViewState } from "../../utils/canvasLayout"
   
   // NEW:
   import { createEmptyViewState } from "../core/viewstate/ViewState";
   // Keep sanitizeStoredViewState in utils for now (or move it)
   ```

2. **Migrate imports in viewStateOrchestrator.ts:**
   ```ts
   // OLD (line 2):
   import { createEmptyViewState, type ViewState } from "../utils/canvasLayout";
   
   // NEW:
   import { createEmptyViewState, type ViewState } from "../core/viewstate/ViewState";
   ```

3. **Consolidate ViewState types:**
   - Decide: keep old `utils/canvasLayout.ts` ViewState for compatibility OR
   - Migrate everything to `core/viewstate/ViewState.ts`
   - Update all usages

**Files:**
- `client/components/ui/InteractiveCanvas.tsx` (line 54)
- `client/state/viewStateOrchestrator.ts` (line 2)
- All files importing ViewState from `utils/canvasLayout.ts`

**Test:**
- All imports use `core/viewstate/ViewState`
- No TypeScript errors
- Existing functionality works

---

## B3-B5 — Stubs (NOT Agent B's Work)

**What "Stub" Means:**
- Empty placeholder functions with correct TypeScript signatures
- Return fake/empty values (e.g., `return {}` or `return false`)
- Compile and pass type checking, but don't do real work
- Agent C/D/E will replace stubs with real implementations later

**Agent B's Job:** ✅ DONE — stubs created, no further work needed

**Agent C's Job (separate):** Will implement B3 (ScopedLayoutRunner) - real ELK execution
**Agent D's Job (separate):** Will implement B4 (Policy) - real decision logic  
**Agent E's Job (separate):** Will use B5 (Orchestrator) - real routing implementation

**Agent B does NOT implement Agent C/D/E's work.**

---

## Summary: What Agent B Actually Needs to Do

**B1 (Renderer Integration):** ⚠️ NOT DONE — REAL WORK NEEDED
- Replace `processLayoutedGraph` with `toReactFlowWithViewState` in `useElkToReactflowGraphConverter.ts`
- Remove backwards ViewState population (lines 698-710)
- Make ViewState the source, not a copy

**B2 (ViewState Migration):** ⚠️ NOT DONE — REAL WORK NEEDED
- Migrate imports from `utils/canvasLayout.ts` to `core/viewstate/ViewState.ts`
- Update `InteractiveCanvas.tsx` and `viewStateOrchestrator.ts`
- Consolidate ViewState types

**B3-B5:** ✅ DONE — Stubs created (Agent C/D/E will implement later, not Agent B's job)

---

## Real Test Requirements

**B1 Integration Test:**
```ts
// In useElkToReactflowGraphConverter.test.ts (or new test file)
it('uses ViewState positions after ELK runs', () => {
  // 1. Run ELK
  // 2. Verify RF nodes use ViewState positions (not ELK positions)
  // 3. Modify ViewState
  // 4. Verify RF nodes update to new ViewState positions
});
```

**B2 Migration Test:**
```ts
// Verify no imports from old paths
it('all ViewState imports use core/viewstate', () => {
  // Grep for imports, verify none from utils/canvasLayout
});
```

