<!-- mode-domain-to-viewstate-migration -->

# Mode Migration: Domain Graph → ViewState

## Problem

**Current state (WRONG):**

- Mode stored in Domain Graph (`rawGraph.children[].mode`)
- Mode persists to Firebase with structure
- Violates DATA_MODEL.md which says mode should be in ViewState

**Target state (CORRECT per DATA_MODEL.md):**

- Mode stored in ViewState (`viewState.layout[groupId].mode`)
- Mode persists with ViewState (when ViewState persistence ships)
- Domain Graph contains only structure (nodes, groups, edges)

## Impact Analysis

### Breaks: Coordinate Refactor (alignment-figjam-cordinate.md)

- **CP5 — Persistence precedence & reload correctness**
- Currently assumes ViewState is geometry only
- After migration: ViewState includes mode, changes snapshot format
- **Action**: CP5 must refactor after mode migration completes

### Breaks: FREE/LOCK Mode Refactor (figjam-free-lock-mode-implementation-27a2163e.plan.md)

#### Wave 1 (Currently in progress)

- **Agent B — ViewState Enforcement** ✅ COMPLETE
- Status: Already fixed mode preservation through ELK
- **BREAKS**: Mode extraction/restoration in `useElkToReactflowGraphConverter.ts` (lines ~692-698)
- **Action**: Remove mode extraction hack after migration

- **Agent D — Policy Gate** ✅ COMPLETE
- Status: `buildModeMap()` extracts mode from Domain Graph (Policy.ts line 227-248)
- **BREAKS**: `buildModeMap(graph)` signature needs `viewState` parameter
- **Action**: Change signature to `buildModeMap(viewState)` or `buildModeMap(graph, viewState)`

- **Agent E — Root Rules** (In progress)
- Status: Not started
- **BLOCKS**: Needs to write mode to ViewState.layout, not Domain

#### Wave 2 (Not started)

- **Agent D — LOCK Gesture Routing**
- Uses `findHighestLockedAncestor()` which depends on `buildModeMap()`
- **Action**: Update to use ViewState-based mode map

#### Wave 3 (Not started)

- **Agent D — Persistence**
- Must persist `viewState.layout[].mode` instead of `domain.mode`
- **Action**: Simplifies - mode is already in ViewState when saving

### Files That Will Break

| File | Line(s) | Current Behavior | Required Change |
|------|---------|------------------|-----------------|
| `client/core/orchestration/Policy.ts` | 227-248 | `buildModeMap(graph)` reads `node.mode` | Add `viewState` param, read from `viewState.layout[id]` |
| `client/core/orchestration/Orchestrator.ts` | 100-111 | `collectModes()` reads `node.mode` | Read from `viewState.layout[id]` instead |
| `client/hooks/useElkToReactflowGraphConverter.ts` | 692-698 | Mode extract/restore around ELK | Remove (mode no longer in ELK input) |
| `client/components/graph/mutations.ts` | 599, 605, 732 | Sets `mode` on group nodes | Remove mode assignment |
| `client/components/ui/InteractiveCanvas.tsx` | 2710, 2723, 2868 | `updatedGroupNode.mode = newMode` | Write to `viewStateRef.current.layout[groupId].mode` |
| `client/components/node/DraftGroupNode.tsx` | 391, 444, 475, 655 | Reads `data.mode` | Read from `viewState.layout[data.id]` |
| `client/components/graph/utils/toReactFlow.ts` | 86 | Passes `node.mode` to ReactFlow | Read from `viewState.layout[node.id]` |

## Migration Plan

### Phase 0: Preparation (No Breaking Changes)

#### 0.1 Add layout section to ViewState type

- **File**: `client/core/viewstate/ViewState.ts`
- **Change**: Add optional `layout?: Record<string, { mode: 'FREE' | 'LOCK' }>`
- **Test**: Type compiles, existing code unaffected

#### 0.2 Create migration helpers

- **File**: `client/core/viewstate/modeHelpers.ts` (new)
- **Create**:
- `extractModeFromDomain(graph): Record<string, 'FREE' | 'LOCK'>` - Scan Domain Graph
- `getModeFromViewState(viewState, groupId): 'FREE' | 'LOCK'` - Read with FREE default
- `setModeInViewState(viewState, groupId, mode): ViewState` - Write immutably
- `migrateModeDomainToViewState(graph, viewState): ViewState` - One-time migration
- **Test**: Helpers work in isolation

### Phase 1: Dual-Read (Backward Compatible)

#### 1.1 Update Policy to read from ViewState (with Domain fallback)

- **File**: `client/core/orchestration/Policy.ts`
- **Change**: `buildModeMap(graph, viewState?)` - try ViewState first, fallback to Domain
- **Test**: Works with or without ViewState.layout

#### 1.2 Update Orchestrator to read from ViewState

- **File**: `client/core/orchestration/Orchestrator.ts`
- **Change**: `collectModes()` checks ViewState.layout, falls back to node.mode
- **Test**: Resolves scope correctly with both sources

#### 1.3 Update renderer to read from ViewState

- **File**: `client/components/graph/utils/toReactFlow.ts`
- **Change**: Read mode from `viewState.layout[node.id]`, fallback to `node.mode`
- **Test**: Renders correctly with both sources

#### 1.4 Update UI to read from ViewState

- **File**: `client/components/node/DraftGroupNode.tsx`
- **Change**: Accept `viewState` prop, read from `viewState.layout[data.id]` with fallback
- **Test**: Arrange button shows correct state

### Phase 2: Dual-Write (Migration Active)

#### 2.1 Update InteractiveCanvas to write to both locations

- **File**: `client/components/ui/InteractiveCanvas.tsx`
- **Change**: `handleArrangeGroup()` writes to both `viewState.layout[id]` AND `rawGraph.mode`
- **Test**: Mode persists in both places

#### 2.2 Add migration on load

- **File**: `client/hooks/useElkToReactflowGraphConverter.ts`
- **Change**: On first load, if `viewState.layout` empty but Domain has mode, migrate
- **Test**: Old saved graphs work, mode appears in ViewState

#### 2.3 Update mutations to write to ViewState

- **File**: `client/components/graph/mutations.ts`
- **Change**: `groupNodes()`, `createWrapperSection()` - add mode to returned ViewState delta
- **Note**: Mutations return both Domain changes and ViewState deltas
- **Test**: New groups default to FREE in ViewState

### Phase 3: Write-Only ViewState (Domain Read-Only)

#### 3.1 Remove Domain writes

- **File**: `client/components/ui/InteractiveCanvas.tsx`
- **Change**: Stop writing to `rawGraph.mode`
- **File**: `client/components/graph/mutations.ts`
- **Change**: Remove `mode: 'FREE'` from group node creation
- **Test**: Mode only written to ViewState

#### 3.2 Update save/load to use ViewState.layout

- **File**: `client/services/architectureService.ts`
- **Change**: Save/load ensures `viewState.layout` preserved
- **Test**: Mode persists across save/reload from ViewState

### Phase 4: ViewState-Only (Clean Up)

#### 4.1 Remove Domain fallbacks

- **File**: `client/core/orchestration/Policy.ts`
- **Change**: Remove Domain fallback, require `viewState` param
- **File**: All read sites
- **Change**: Remove `|| node.mode` fallbacks
- **Test**: All tests pass with ViewState only

#### 4.2 Remove mode from Domain Graph types

- **File**: `client/types/graph.ts`
- **Change**: Remove `mode?: 'FREE' | 'LOCK'` from `ElkGraphNode` interface
- **Test**: Type checks pass, no mode in Domain

#### 4.3 Remove mode extraction hack from useElkToReactflowGraphConverter

- **File**: `client/hooks/useElkToReactflowGraphConverter.ts`
- **Change**: Remove lines ~692-698 (mode extract/restore around ELK)
- **Reason**: Mode no longer in ELK input, doesn't need preservation
- **Test**: ELK works, mode unchanged (it's in ViewState, not ELK)

### Phase 5: Update Documentation

#### 5.1 Confirm DATA_MODEL.md is correct

- **File**: `docs/DATA_MODEL.md`
- **Change**: Verify lines 125-133 match implementation
- **Test**: N/A (docs only)

## Implementation Order

1. **Phase 0** (Prep) - No breaking changes, adds infrastructure
2. **Phase 1** (Dual-Read) - Components read from ViewState, fallback to Domain
3. **Phase 2** (Dual-Write) - Write to both, migration runs on load
4. **Phase 3** (ViewState-Write) - Only write to ViewState, Domain read-only
5. **Phase 4** (Cleanup) - Remove Domain mode entirely

## Coordination with Other Refactors

### Coordinate Refactor (alignment-figjam-cordinate.md)

- **Proceed through CP1-CP4** (no mode dependencies)
- **BLOCK CP5** until Phase 3 complete
- **After Phase 3**: CP5 can implement ViewState persistence including `layout[].mode`

### FREE/LOCK Mode Refactor (figjam-free-lock-mode-implementation-27a2163e.plan.md)

- **Agent B, C, D (Wave 1)** - Already complete, need Phase 4 cleanup
- **Agent E (Wave 1)** - BLOCKED until Phase 2 complete (needs dual-write)
- **Wave 2** - Can proceed after Phase 2 (dual-read/write active)
- **Wave 3 Agent D (Persistence)** - Can proceed after Phase 3 (ViewState-only write)

## Agent Assignment

### Agent B Inter — Mode Migration

- **Tasks**: All phases (0-5)
- **Files**: 
- `client/core/viewstate/ViewState.ts`
- `client/core/viewstate/modeHelpers.ts` (new)
- `client/core/orchestration/Policy.ts`
- `client/core/orchestration/Orchestrator.ts`
- `client/hooks/useElkToReactflowGraphConverter.ts`
- `client/components/graph/mutations.ts`
- `client/components/graph/utils/toReactFlow.ts`
- `client/components/ui/InteractiveCanvas.tsx`
- `client/components/node/DraftGroupNode.tsx`
- `client/services/architectureService.ts`
- `client/types/graph.ts`
- **Gate**: Phase 4 complete, all tests green, mode only in ViewState
- **Blocks**: 
- Coordinate CP5
- FREE/LOCK Wave 1 Agent E
- FREE/LOCK Wave 3 Agent D

## Testing Checklist

- [ ] Phase 0: ViewState.layout type exists, compiles
- [ ] Phase 1: Policy reads mode from ViewState (or Domain fallback)
- [ ] Phase 1: Renderer shows correct mode from ViewState
- [ ] Phase 2: Mode written to both ViewState and Domain
- [ ] Phase 2: Old saves migrate Domain mode → ViewState on load
- [ ] Phase 3: Mode only written to ViewState
- [ ] Phase 3: Save/load preserves ViewState.layout
- [ ] Phase 4: No Domain mode reads, all from ViewState
- [ ] Phase 4: Domain Graph has no `mode` field
- [ ] Phase 4: ELK processing works without mode preservation hack
- [ ] All FREE/LOCK tests still pass
- [ ] Coordinate tests unaffected (CP1-CP4)

## Success Criteria

- ✅ Mode stored in `viewState.layout[groupId].mode`
- ✅ Mode NOT in Domain Graph
- ✅ All mode reads from ViewState
- ✅ All mode writes to ViewState
- ✅ DATA_MODEL.md matches implementation
- ✅ Backward compatible migration (old saves work)
- ✅ All existing tests pass
- ✅ Coordinate CP5 unblocked
- ✅ FREE/LOCK Wave 1-3 unblocked

