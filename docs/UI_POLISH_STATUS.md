# UI Polish Work Status - What Can Be Tested Now

## Overview

Two major refactors are ongoing:
1. **FREE/LOCK Mode Implementation** (FigJam plan) - Core orchestration complete, UI polish needed
2. **Coordinate Refactor** (CP1-CP5) - CanvasAdapter skeleton exists, containment/drag work pending

## ✅ SAFE TO WORK ON NOW (No Coordinate Dependencies)

These UI features can be implemented and tested immediately:


### 2. Group Mode Toggle UI (Phase 5.1)
- **Status**: ⚠️ Partial - Mode toggle logic exists in InteractiveCanvas (line 2723-2752), but no dedicated UI component
- **What to do**:
  - Create `GroupModeToggle.tsx` component (FREE/LOCK toggle button)
  - Add to group context menu or sidebar when group is selected
  - Disable for root group
- **Files**:
  - `client/components/ui/GroupModeToggle.tsx` (new)
  - Wire into group selection UI (wherever group actions are shown)
- **Dependencies**: None - mode field already exists in graph structure
- **Test**: Toggle works, persists, root cannot be locked

### 3. Arrange Button Behavior (Phase 3.4)
- **Status**: ✅ Already implemented
- **Current behavior**:
  - Arrange button on each group toggles FREE ↔ LOCK
  - When LOCK: button turns blue, ELK runs on group contents
  - When FREE: button is gray, manual positioning allowed
  - Moving items inside group automatically changes LOCK → FREE
- **Note**: There's code that hides the button in LOCK mode (line 390-395 in DraftGroupNode.tsx), but this should be removed - the button should always be visible as it's the toggle mechanism

### 4. Root Cannot Be LOCK (Phase 1.3)
- **Status**: ✅ Already enforced in mutations.ts (line 599, 605)
- **What to do**: 
  - Add UI validation (disable toggle in GroupModeToggle if `groupId === 'root'`)
  - Add visual indicator that root is always FREE
- **Files**: 
  - `client/components/ui/GroupModeToggle.tsx` (when created)
  - Any UI that allows mode changes
- **Dependencies**: None
- **Test**: Root mode toggle disabled, visual indicator shows

### 5. Persist Mode in Save/Load (Phase 5.2)
- **Status**: ⚠️ Partial - Mode field exists, need to verify persistence
- **What to do**:
  - Verify `mode` field is included in save payload
  - Verify `mode` field is restored on load
  - Add tests for mode persistence
- **Files**:
  - `client/services/architectureService.ts` or save/load code
  - Check `client/components/graph/mutations.ts` (mode already set on creation)
- **Dependencies**: None - just data persistence
- **Test**: Create group, set mode, save, reload, verify mode persists

### 6. Remove Source Metadata (Phase 5.3)
- **Status**: ⚠️ Unknown - Need to check if `source` field persists
- **What to do**:
  - Audit save/load code to ensure `source`/`createdBy` never persisted
  - Strip these fields before saving
  - Add validation tests
- **Files**: 
  - Save/load service files
  - `client/components/graph/mutations.ts` (check mutation call sites)
- **Dependencies**: None
- **Test**: Save diagram, reload, verify no `source` or `createdBy` fields

## ⚠️ CANNOT TEST YET (Coordinate Refactor Dependencies)

These features depend on coordinate refactor checkpoints:

### 1. Adopt/Eject on Move/Resize (Phase 2.2)
- **Blocks**: CP2 - Containment on world coordinates
- **Why**: Needs `CanvasAdapter.getWorldNodeBounds()` for full-containment detection
- **Current**: Containment detection exists but may not use adapter yet
- **Wait for**: CP2 completion (containment uses adapter only)

### 2. Rubber-band Connectors (Phase 2.3)
- **Blocks**: CP3 - Drag temp world positions
- **Why**: Needs `CanvasAdapter.beginDrag/updateDrag/endDrag` lifecycle
- **Current**: No drag lifecycle in adapter yet
- **Wait for**: CP3 completion (temp world positions during drag)

### 3. LOCK Explicit Drop Targets (Phase 3.3)
- **Blocks**: CP3 - Drag temp world positions
- **Why**: Needs temp positions to highlight valid drop targets during drag
- **Current**: No drag overlay system
- **Wait for**: CP3 completion

### 4. Wrapper Section Creation (Phase 2.1)
- **Status**: ⚠️ Partially safe - Basic creation can be tested
- **What works**: Domain reparent, single ELK run
- **What doesn't**: Full containment-based adoption (needs CP2)
- **Can test**: Create wrapper, verify ELK runs once
- **Cannot test**: Automatic adoption of contained nodes (needs world containment)

### 5. Block Resize in LOCK (Phase 3.2)
- **Status**: ⚠️ Partially safe - Can add UI disable
- **What works**: Disable resize handle in UI when `mode === 'LOCK'`
- **What doesn't**: Coordinate-aware resize prevention (if needed)
- **Can test**: UI disable works
- **May need**: Coordinate refactor for proper resize blocking

## 📊 Implementation Priority

### High Priority (No Dependencies)
1. ✅ Group Mode Toggle UI (mode logic exists, needs component)
3. ✅ Hide Arrange button in LOCK (simple conditional)
4. ✅ Root cannot be LOCK validation (add UI check)

### Medium Priority (No Dependencies)
5. ✅ Persist mode in save/load (verify existing code)
6. ✅ Remove source metadata (audit and strip)

### Low Priority (Coordinate Dependencies)
7. ⚠️ Adopt/Eject (wait for CP2)
8. ⚠️ Rubber-band connectors (wait for CP3)
9. ⚠️ LOCK drop targets (wait for CP3)
10. ⚠️ Block resize in LOCK (can do UI now, may need coordinate work later)

## 🧪 Testing Strategy

### Safe to Test Now
- All UI components (buttons, toggles, conditional rendering)
- Mode persistence (save/load)
- "Arrange All" functionality (uses existing `runScopeLayout`)
- Root LOCK prevention (validation)

### Wait for Coordinate Refactor
- Containment-based features (adopt/eject)
- Drag-based features (rubber-band, drop targets)
- Coordinate-aware resize blocking

## 📝 Notes

- **Coordinate refactor status**: CP1 (adapter skeleton) appears complete, CP2-CP3 pending
- **FREE/LOCK status**: Core orchestration (Policy, ScopedLayoutRunner, Orchestrator) complete
- **Integration point**: `InteractiveCanvas.tsx` already has some mode handling (line 2723-2752)
- **Safe assumption**: UI-only work (buttons, toggles, conditional rendering) is always safe

