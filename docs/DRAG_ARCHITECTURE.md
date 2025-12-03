# Drag & Drop Architecture

## Problem Statement

Drag functionality keeps breaking because:
1. Multiple code paths handle drag events
2. State updates are not atomic
3. Reparenting timing was inconsistent (now: ALWAYS during drag)

## Design Principles

### 1. Single Source of Truth for Positions
- **ViewState** stores ABSOLUTE positions for ALL nodes (root and children)
- **ReactFlow** receives ABSOLUTE positions (NO coordinate conversion - we handle positioning ourselves)
- **Domain** stores STRUCTURE only (no positions)

### 2. NO ReactFlow Coordinate Conversion
We do NOT use ReactFlow's parent-relative positioning. All nodes use absolute coordinates:
- `draggable: true` on all nodes
- We manually move children when group is dragged
- This gives us full control and eliminates ReactFlow's coordinate confusion

### 3. Single Entry Point for Drag Events
All drag events flow through ONE handler: `DragCoordinator`

```
ReactFlow onNodesChange → DragCoordinator → ViewState + Domain → Re-render
```

### 4. Reparenting Happens DURING Drag
- Containment detection runs on every drag move
- Reparenting updates Domain immediately when detected
- This provides real-time visual feedback
- NO waiting for drag end

### 5. Atomic State Updates
Position updates and reparenting happen together:
- Calculate new absolute position
- Detect containment
- If reparent needed: update Domain immediately
- Update ViewState position
- Trigger re-render

### 6. Clear Coordinate Contract

```typescript
// ViewState: ALWAYS absolute world coordinates
interface ViewStateGeometry {
  x: number;  // absolute X in world space
  y: number;  // absolute Y in world space  
  w: number;
  h: number;
}

// ReactFlow: ALSO absolute (we don't use relative positioning)
interface ReactFlowPosition {
  x: number;  // absolute X (same as ViewState)
  y: number;  // absolute Y (same as ViewState)
}

// NO conversion needed - positions are always absolute
```

## Architecture

### DragCoordinator (Single Entry Point)

```typescript
// client/core/drag/DragCoordinator.ts

interface DragState {
  isDragging: boolean;
  draggedNodeIds: Set<string>;
  startPositions: Map<string, { x: number; y: number }>;  // absolute
}

class DragCoordinator {
  private state: DragState;
  private viewStateRef: React.MutableRefObject<ViewState>;
  private domainRef: React.MutableRefObject<RawGraph>;
  
  // Called on every position change DURING drag
  // Reparenting happens HERE, not on drag end
  handleDragMove(nodeId: string, newAbsolutePos: Position): void {
    // 1. Update ViewState position immediately
    this.updateViewStatePosition(nodeId, newAbsolutePos);
    
    // 2. If this is a group, move children by same delta
    if (this.isGroup(nodeId)) {
      const delta = this.calculateDelta(nodeId, newAbsolutePos);
      this.moveChildrenBy(nodeId, delta);
    }
    
    // 3. Check for reparenting (for non-groups)
    if (!this.isGroup(nodeId)) {
      const containingGroup = this.findContainingGroup(nodeId, newAbsolutePos);
      const currentParent = this.getCurrentParent(nodeId);
      
      if (containingGroup !== currentParent) {
        // Reparent IMMEDIATELY during drag
        this.reparentNode(nodeId, currentParent, containingGroup);
      }
    }
    
    // 4. Trigger re-render
    this.triggerRender();
  }
  
  // Called when drag ends - just persist to localStorage
  handleDragEnd(): void {
    // Persist final state
    this.persistToLocalStorage();
    this.resetDragState();
  }
  
  private reparentNode(nodeId: string, from: string | null, to: string | null): void {
    // Update domain structure immediately
    const newParentId = to || 'root';
    this.domainRef.current = moveNode(nodeId, newParentId, this.domainRef.current);
    
    // If moving into group, set FREE mode
    if (to) {
      const group = findNodeById(this.domainRef.current, to);
      if (group) group.mode = 'FREE';
    }
    
    // Update React state
    this.setRawGraph(this.domainRef.current, 'user');
  }
}
```

### No Coordinate Conversion Needed

Since we use absolute positions everywhere:
- ViewState stores absolute positions
- ReactFlow receives absolute positions
- No conversion between the two

```typescript
// Positions are ALWAYS absolute - no conversion
const position = viewState.node[nodeId]; // { x: 300, y: 400 }
// Same position goes to ReactFlow
const reactFlowNode = { position: { x: position.x, y: position.y } };
```

## Integration with ReactFlow

### onNodesChange Handler (Simplified)

```typescript
// In InteractiveCanvas.tsx

onNodesChange={(changes) => {
  // 1. Let ReactFlow handle its internal state
  onNodesChange(changes);
  
  // 2. Route drag events to DragCoordinator
  const positionChanges = changes.filter(c => c.type === 'position');
  
  for (const change of positionChanges) {
    if (change.position) {
      if (change.dragging) {
        // DURING drag - update position AND check reparenting
        dragCoordinator.handleDragMove(change.id, change.position);
      } else {
        // Drag ended - just persist
        dragCoordinator.handleDragEnd();
      }
    }
  }
}}
```

## Testing Contract

### 1. State Synchronization Tests

These tests verify that all state sources stay in sync:

```typescript
describe('State Synchronization', () => {
  it('ViewState and Domain stay in sync after drag', () => {
    // Setup: node in ViewState and Domain
    // Action: drag node
    // Assert: ViewState position updated
    // Assert: Domain structure unchanged (no reparent)
    // Assert: Both refs point to same logical state
  });
  
  it('ViewState and Domain stay in sync after reparent', () => {
    // Setup: node at root, group exists
    // Action: drag node into group
    // Assert: ViewState position unchanged
    // Assert: Domain shows node as child of group
    // Assert: rawGraphRef.current === domainRef.current
  });
  
  it('localStorage matches in-memory state after drag', () => {
    // Setup: node exists
    // Action: drag node
    // Assert: localStorage snapshot matches viewStateRef
    // Assert: localStorage snapshot matches domainRef
  });
  
  it('state survives page reload', () => {
    // Setup: drag node to new position
    // Action: reload page
    // Assert: node appears at same position
    // Assert: domain structure preserved
  });
  
  it('React state and refs stay in sync', () => {
    // Setup: node exists
    // Action: drag node
    // Assert: rawGraph (React state) === rawGraphRef.current
    // Assert: viewStateRef.current has updated position
  });
});
```

### 2. Reparenting Tests (During Drag)

```typescript
describe('Reparenting During Drag', () => {
  it('reparents node INTO group during drag, not after', () => {
    // Setup: node at (500, 500), group at (100, 100) size 400x400
    // Action: drag node to (200, 200) - inside group
    // Assert DURING drag: Domain shows node as child of group
    // Assert DURING drag: ViewState position is (200, 200)
  });
  
  it('reparents node OUT OF group during drag', () => {
    // Setup: node inside group at (200, 200)
    // Action: drag node to (600, 600) - outside group
    // Assert DURING drag: Domain shows node at root
    // Assert DURING drag: ViewState position is (600, 600)
  });
  
  it('does NOT reparent if node only partially overlaps group', () => {
    // Setup: node at (500, 500), group at (100, 100) size 200x200
    // Action: drag node to (250, 250) - partially overlapping
    // Assert: Domain shows node still at root
  });
});
```

### 3. Group Drag Tests

```typescript
describe('Group Drag - Children Move With Group', () => {
  it('children move with group during drag', () => {
    // Setup: group at (100, 100), child at (150, 150)
    // Action: drag group to (200, 200)
    // Assert DURING drag: child ViewState is (250, 250)
    // Assert: child moved by same delta as group
  });
  
  it('nested children move with parent group', () => {
    // Setup: outer group → inner group → node
    // Action: drag outer group
    // Assert: inner group and node both move by same delta
  });
  
  it('group drag does NOT trigger reparenting of group itself', () => {
    // Setup: group at (100, 100), another group at (500, 500)
    // Action: drag first group into second group's bounds
    // Assert: first group is NOT reparented (groups don't auto-nest)
  });
});
```

### 4. Position Preservation Tests

```typescript
describe('Position Preservation', () => {
  it('absolute position preserved when reparenting into group', () => {
    // Setup: node at (300, 300), group at (100, 100)
    // Action: drag node into group (still at 300, 300)
    // Assert: ViewState.node[id] = { x: 300, y: 300 }
    // Assert: Visual position unchanged
  });
  
  it('absolute position preserved when reparenting out of group', () => {
    // Setup: node inside group, ViewState shows (250, 250)
    // Action: drag node outside group to (500, 500)
    // Assert: ViewState.node[id] = { x: 500, y: 500 }
    // Assert: Visual position is (500, 500)
  });
});
```

### 5. E2E Tests (Playwright)

```typescript
describe('Drag E2E', () => {
  it('node dragged into group: reparenting happens during drag', async () => {
    // 1. Create node at known position
    // 2. Create group at known position
    // 3. Start drag, move into group bounds (don't release mouse)
    // 4. Assert DURING DRAG: Domain shows node as child of group
    // 5. Release mouse
    // 6. Assert: state persisted to localStorage
  });
  
  it('group drag moves children visually in real-time', async () => {
    // 1. Create group with child node
    // 2. Start dragging group
    // 3. Assert DURING DRAG: child node moves with group
    // 4. Release mouse
    // 5. Assert: final positions correct in ViewState
  });
});
```

## Migration Plan

### Phase 1: Create DragCoordinator (Non-Breaking)
1. Create `client/core/drag/DragCoordinator.ts`
2. Add unit tests for state sync
3. Add unit tests for reparenting during drag

### Phase 2: Remove Scattered Drag Logic
1. Delete `canvasDragHandler.ts` (logic moves to DragCoordinator)
2. Remove drag handling from `useElkToReactflowGraphConverter.ts`
3. Remove coordinate conversion from `ReactFlowAdapter.ts`

### Phase 3: Integrate DragCoordinator
1. Replace scattered drag handling in `InteractiveCanvas.tsx` with single call to DragCoordinator
2. Simplify `onNodesChange` handler to just route to DragCoordinator

### Phase 4: Add Comprehensive Tests
1. State synchronization tests (ViewState, Domain, localStorage, refs)
2. Reparenting during drag tests
3. Group drag tests
4. E2E tests for visual verification

## Invariants (Must Always Be True)

1. **ViewState positions are ALWAYS absolute** - Never store relative positions
2. **ReactFlow positions are ALWAYS absolute** - No parent-relative conversion
3. **Reparenting happens DURING drag** - Not on drag end
4. **Reparenting preserves absolute position** - Node stays where it is visually
5. **Group drag moves children** - Children maintain relative offset to group
6. **State sources stay in sync** - ViewState ref, Domain ref, React state, localStorage

## Anti-Patterns to Avoid

1. ❌ Converting coordinates between ReactFlow and ViewState
2. ❌ Waiting for drag end to reparent
3. ❌ Having multiple places handle drag events
4. ❌ Letting ViewState and Domain refs get out of sync
5. ❌ Using ReactFlow's parent-relative positioning

## Files to Consolidate/Remove

After migration, drag logic should ONLY exist in:
- `client/core/drag/DragCoordinator.ts` - ALL drag logic
- `client/components/ui/InteractiveCanvas.tsx` - Routes events to DragCoordinator

Remove drag logic from:
- `client/utils/canvas/canvasDragHandler.ts` - DELETE
- `client/utils/containmentDetection.ts` - Move to DragCoordinator
- `client/hooks/useElkToReactflowGraphConverter.ts` - Remove drag handling
- `client/core/renderer/ReactFlowAdapter.ts` - Remove coordinate conversion

