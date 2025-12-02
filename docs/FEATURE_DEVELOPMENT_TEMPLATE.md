# Feature Development Template

## Pre-Implementation Checklist

### 1. Architecture Enforcement ✅
**Before writing any code, verify:**

- [ ] **Single Entry Point**: All operations go through `Orchestrator.apply()`
- [ ] **No Direct ReactFlow**: No `setNodes()` or `setEdges()` outside renderer
- [ ] **ViewState Authority**: Renderer reads ONLY from ViewState, never Domain/ELK
- [ ] **No Fallbacks**: If geometry missing, fail loudly (no ELK fallbacks in FREE mode)

**Architecture Violations to Check:**
```bash
# These should return ZERO results in your feature code:
grep -r "setNodes\|setEdges" client/components/ui/  # ❌ Direct ReactFlow manipulation
grep -r "elkGraph\|elk\." client/components/ui/     # ❌ ELK in UI components  
grep -r "domain\." client/core/renderer/            # ❌ Domain in renderer
```

### 2. Test-First Development ✅
**Write tests BEFORE implementation:**

- [ ] **Core functionality test** (feature works)
- [ ] **Position accuracy test** (geometry correct)
- [ ] **Persistence test** (survives refresh)
- [ ] **Deletion test** (cleanup works)

### 3. Entry Points Documentation ✅
**Identify which entry point your feature uses:**

---

## Current Architecture (Solidified)

### Core Flow
```
INPUT → Orchestration → Domain → Layout → ViewState → Renderer → OUTPUT
```

### Key Invariants
1. **ViewState is geometry source of truth** - Renderer reads exclusively from ViewState
2. **No fallbacks** - If geometry missing, fail loudly in dev  
3. **Domain never affects renderer directly** - All geometry flows through ViewState
4. **Orchestration coordinates** - Only orchestration writes to Domain/Layout/ViewState

### Module Structure
```
core/
├── domain/          # Pure structure (nodes, groups, edges, no geometry)
├── viewstate/       # Authoritative geometry (positions, sizes, waypoints)  
├── layout/          # ELK orchestration (scoped, anchored layout runs)
├── renderer/        # ReactFlow conversion (reads Domain + ViewState)
└── orchestration/   # Policy & coordination (routes intents, sequences operations)
```

---

## Current Entry Points (Documented)

### 1. Canvas Click Interactions
**File**: `client/utils/canvas/canvasInteractions.ts`
**Function**: `placeNodeOnCanvas()`
**Flow**: 
```
User Click → placeNodeOnCanvas() → Orchestrator.apply() → Domain + ViewState → Renderer
```
**Intent Format**:
```typescript
{
  source: 'user',
  kind: 'free-structural',
  scopeId: 'root',
  payload: {
    action: 'add-node',
    nodeId: string,
    parentId: string,
    position: { x: number, y: number },
    size: { w: number, h: number },
    data: { label: string }
  }
}
```

### 2. Chat/AI Interactions  
**File**: `client/components/ui/Chatbox.tsx` → `client/components/graph/userRequirements.ts`
**Function**: `process_user_requirements()`
**Flow**:
```
Chat Submit → process_user_requirements() → AI Agent → Tool Calls → Orchestrator.apply()
```
**Intent Format**: Same as above but `source: 'ai'` and `kind: 'ai-structural'`

### 3. Toolbar Tool Selection
**File**: `client/components/ui/CanvasToolbar.tsx`
**Function**: `onSelect(tool)`
**Flow**:
```
Tool Click → onSelect() → State Update → Canvas Click Handler Changes
```

### 4. Keyboard Shortcuts
**File**: `client/utils/canvas/canvasDeleteInteractions.ts`
**Function**: `handleDeleteKey()`
**Flow**:
```
Delete Key → handleDeleteKey() → Orchestrator.apply() → Domain + ViewState → Renderer
```

### 5. Group Operations
**File**: `client/utils/canvas/canvasGroupInteractions.ts`
**Function**: `handleGroupToolPaneClick()`
**Flow**: Similar to node placement but creates groups

---

## Current Test Patterns (Established)

### 1. Core Functionality Test Pattern
**File**: `client/components/ui/__tests__/canvas-functionality.test.tsx`
**Pattern**:
```typescript
describe('Feature Name', () => {
  it('performs core action and appears on canvas', async () => {
    // Setup test environment
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: Node[] = [];
    let capturedEdges: Edge[] = [];

    // Initialize orchestrator
    initializeOrchestrator(
      testGraph, testViewState, () => {},
      (graph) => { testGraph.current = graph; },
      (nodes) => { capturedNodes = [...nodes]; },
      (edges) => { capturedEdges = [...edges]; }
    );

    // Apply action
    await apply({
      source: 'user',
      kind: 'free-structural', 
      scopeId: 'root',
      payload: { /* your action payload */ }
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify results
    expect(capturedNodes.length).toBe(1);
    expect(testGraph.current.children.length).toBe(1);
    expect(testViewState.current.node[nodeId]).toBeDefined();
  });
});
```

### 2. Position Accuracy Test Pattern
```typescript
it('feature appears at correct position', async () => {
  // ... setup ...
  
  const expectedPosition = { x: 100, y: 200 };
  await apply({
    // ... intent with position ...
  });
  
  expect(capturedNodes[0].position).toEqual(expectedPosition);
  expect(testViewState.current.node[nodeId].position).toEqual(expectedPosition);
});
```

### 3. Persistence Test Pattern  
```typescript
it('feature persists after refresh', async () => {
  // ... setup and add feature ...
  
  // Save to localStorage
  const snapshot = {
    rawGraph: testGraph.current,
    viewState: testViewState.current,
    selectedArchitectureId: 'test-architecture',
    timestamp: Date.now()
  };
  localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, JSON.stringify(snapshot));

  // Simulate refresh
  testGraph.current = { id: 'root', children: [], edges: [] };
  testViewState.current = { node: {}, group: {}, edge: {} };
  capturedNodes = [];

  // Restore
  const restored = restoreCanvasSnapshot();
  if (restored) {
    testGraph.current = restored.rawGraph;
    testViewState.current = restored.viewState;
  }

  // Trigger restoration render
  triggerRestorationRender(
    { current: testGraph.current },
    { current: testViewState.current }
  );
  await new Promise(resolve => setTimeout(resolve, 200));

  // Verify persistence
  expect(capturedNodes.length).toBe(1);
  expect(testGraph.current.children.length).toBe(1);
});
```

### 4. Deletion Test Pattern
```typescript
it('feature deletes and does not reappear after refresh', async () => {
  // ... setup and add feature ...
  
  // Delete the feature
  await apply({
    source: 'user',
    kind: 'free-structural',
    scopeId: 'root',
    payload: { action: 'delete-node', nodeId },
  });

  // Verify deletion from all sources
  expect(capturedNodes.length).toBe(0);
  expect(testGraph.current.children.length).toBe(0);
  expect(testViewState.current.node[nodeId]).toBeUndefined();

  // Test persistence of deletion
  // ... save, refresh, restore ...
  
  // Verify deleted item doesn't reappear
  expect(capturedNodes.length).toBe(0);
});
```

---

## Feature Implementation Steps

### Step 1: Architecture Review (5 min)
- [ ] Review `docs/FIGJAM_REFACTOR.md` for your feature's scope
- [ ] Identify which entry point your feature uses
- [ ] Check for existing similar patterns in codebase
- [ ] Verify no architecture violations exist in related code

### Step 2: Write Tests First (30 min)
- [ ] Copy appropriate test pattern from above
- [ ] Customize for your specific feature
- [ ] Write failing tests that capture the requirements
- [ ] Run tests to confirm they fail appropriately

### Step 3: Identify Entry Point (5 min)
- [ ] Canvas interaction → use `canvasInteractions.ts` pattern
- [ ] AI/Chat feature → use `userRequirements.ts` pattern  
- [ ] Toolbar feature → use `CanvasToolbar.tsx` pattern
- [ ] Keyboard shortcut → use `canvasDeleteInteractions.ts` pattern

### Step 4: Implement Feature (Variable)
- [ ] Follow the established entry point pattern
- [ ] All operations MUST go through `Orchestrator.apply()`
- [ ] Use proper intent format for your action type
- [ ] No direct ReactFlow manipulation
- [ ] No ELK fallbacks in FREE mode

### Step 5: Verify Tests Pass (10 min)
- [ ] Run your specific test file
- [ ] Verify all 4 test types pass (core, position, persistence, deletion)
- [ ] Check for any architecture violations
- [ ] Ensure no regressions in existing tests

### Step 6: Integration Check (10 min)
- [ ] Test feature manually in browser
- [ ] Verify persistence works in real app
- [ ] Check that feature integrates with existing tools
- [ ] Confirm no console errors or warnings

---

## Common Patterns by Feature Type

### Adding New Canvas Elements
**Entry Point**: `canvasInteractions.ts`
**Intent**: `{ action: 'add-X', ... }`
**Tests**: All 4 patterns (core, position, persistence, deletion)

### Modifying Existing Elements  
**Entry Point**: Various interaction files
**Intent**: `{ action: 'modify-X', ... }`
**Tests**: Core + persistence (position may not change)

### AI/Chat Features
**Entry Point**: `userRequirements.ts`
**Intent**: `{ source: 'ai', kind: 'ai-structural', ... }`
**Tests**: Core + persistence (AI features may not have direct position control)

### Keyboard Shortcuts
**Entry Point**: `canvasDeleteInteractions.ts` pattern
**Intent**: Various depending on action
**Tests**: Core + deletion (shortcuts often delete/modify)

---

## Architecture Enforcement Rules

### ✅ ALLOWED
- `Orchestrator.apply()` for all operations
- Reading from ViewState in renderers
- Writing to ViewState from Orchestrator/Layout only
- ELK usage in AI/LOCK mode only

### ❌ FORBIDDEN  
- Direct `setNodes()` or `setEdges()` calls
- Reading Domain/ELK geometry in renderer
- ELK fallbacks in FREE mode
- Orchestration logic in hooks or components
- Multiple rendering paths for same operation

---

## Time Estimates with Template

**Using this template**:
- Simple canvas feature: **1-2 hours**
- Complex interaction: **2-4 hours**  
- AI integration: **3-5 hours**

**Without template** (old way):
- Simple feature: **4-8 hours**
- Complex feature: **8-16 hours**
- AI integration: **10-20 hours**

**Expected speedup: 50-75% time reduction**

---

## Next Feature Priorities

1. **ELK for groups in FREE mode** - Canvas interaction, should reuse node patterns
2. **Selection in FREE mode** - Keyboard/mouse interaction, similar to deletion
3. **AI diagram in LOCK mode** - AI integration, may need Layout module work

All three should follow this template for consistent, fast development.




