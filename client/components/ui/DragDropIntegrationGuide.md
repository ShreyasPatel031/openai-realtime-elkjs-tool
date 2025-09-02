# Drag and Drop Edge Handler Integration Guide

This guide shows how to integrate the new drag-to-connect functionality into your InteractiveCanvas component.

## Components Overview

### 1. `DragDropEdgeHandler.tsx`
- Core component that wraps around nodes to add drag-to-connect functionality
- Shows four directional arrows when a node is selected
- Handles hover detection and edge creation
- Integrates with your existing graph update system

### 2. `EnhancedCustomNode.tsx`
- Wraps your existing CustomNode with DragDropEdgeHandler
- Adds hover highlighting effects
- Maintains all existing CustomNode functionality

### 3. `EnhancedGroupNode.tsx`
- Wraps your existing GroupNode with DragDropEdgeHandler
- Adds hover highlighting for group nodes
- Maintains all existing GroupNode functionality

## Integration Steps

### Step 1: Update node types in InteractiveCanvas.tsx

Replace this section around line 120:

```typescript
// OLD CODE
const nodeTypes = {
  custom: CustomNodeComponent,
  group: GroupNode
};
```

With:

```typescript
// NEW CODE
import EnhancedCustomNode from "./EnhancedCustomNode"
import EnhancedGroupNode from "./EnhancedGroupNode"

const nodeTypes = {
  custom: (props: any) => (
    <EnhancedCustomNode 
      {...props} 
      onLabelChange={handleLabelChange}
      onGraphChange={handleGraphChange}
      rawGraph={rawGraph}
    />
  ),
  group: (props: any) => (
    <EnhancedGroupNode 
      {...props} 
      onAddNode={handleAddNodeToGroup}
      onGraphChange={handleGraphChange}
      rawGraph={rawGraph}
    />
  )
};
```

### Step 2: Update the memoized node types (around line 1804)

Replace:

```typescript
// OLD CODE
const memoizedNodeTypes = useMemo(() => {
  const types = {
  custom: (props: any) => <CustomNodeComponent {...props} onLabelChange={handleLabelChange} />,
  group: (props: any) => <GroupNode {...props} onAddNode={handleAddNodeToGroup} />,
  };
  return types;
}, [handleLabelChange, handleAddNodeToGroup]);
```

With:

```typescript
// NEW CODE
const memoizedNodeTypes = useMemo(() => {
  const types = {
    custom: (props: any) => (
      <EnhancedCustomNode 
        {...props} 
        onLabelChange={handleLabelChange}
        onGraphChange={handleGraphChange}
        rawGraph={rawGraph}
      />
    ),
    group: (props: any) => (
      <EnhancedGroupNode 
        {...props} 
        onAddNode={handleAddNodeToGroup}
        onGraphChange={handleGraphChange}
        rawGraph={rawGraph}
      />
    ),
  };
  return types;
}, [handleLabelChange, handleAddNodeToGroup, handleGraphChange, rawGraph]);
```

### Step 3: Update ReactFlow connection handling

You may want to disable the default connection behavior since we're handling it with drag and drop:

```typescript
// In your ReactFlow component (around line 3900), you can optionally disable default connections:
<ReactFlow
  // ... existing props
  connectionMode={ConnectionMode.Loose}
  // Optionally disable default handle-to-handle connections if you only want drag-to-connect
  // connectOnClick={false}
  // ... rest of props
>
```

### Step 4: Optional - Add connection mode controls

You can add a toggle to switch between traditional handle connections and the new drag-to-connect:

```typescript
// Add state for connection mode
const [useDragToConnect, setUseDragToConnect] = useState(true);

// Update node types conditionally
const memoizedNodeTypes = useMemo(() => {
  if (useDragToConnect) {
    return {
      custom: (props: any) => (
        <EnhancedCustomNode 
          {...props} 
          onLabelChange={handleLabelChange}
          onGraphChange={handleGraphChange}
          rawGraph={rawGraph}
        />
      ),
      group: (props: any) => (
        <EnhancedGroupNode 
          {...props} 
          onAddNode={handleAddNodeToGroup}
          onGraphChange={handleGraphChange}
          rawGraph={rawGraph}
        />
      ),
    };
  } else {
    // Fall back to original nodes
    return {
      custom: (props: any) => <CustomNodeComponent {...props} onLabelChange={handleLabelChange} />,
      group: (props: any) => <GroupNode {...props} onAddNode={handleAddNodeToGroup} />,
    };
  }
}, [useDragToConnect, handleLabelChange, handleAddNodeToGroup, handleGraphChange, rawGraph]);
```

## Features

### Drag-to-Connect
- Select any node to see four directional arrows (top, right, bottom, left)
- Drag from any arrow to another node
- Target nodes glow green when hovered during drag
- Automatically creates edges using your existing graph update system

### Hover Highlighting
- Nodes highlight with green glow when they're valid drop targets
- Smooth animations and transitions
- Visual feedback during the entire drag operation

### Integration with Existing System
- Uses your existing `batchUpdate` and `handleGraphChange` functions
- Preserves all current node functionality
- Works with both CustomNode and GroupNode components
- Maintains selection, editing, and all other existing features

## Troubleshooting

### If arrows don't appear:
- Ensure the node is selected
- Check that `onGraphChange` and `rawGraph` props are passed correctly
- Verify the DragDropEdgeHandler is properly wrapping the node

### If edges aren't created:
- Check console for error messages during edge creation
- Ensure `batchUpdate` function is working correctly
- Verify that the `rawGraph` structure is compatible

### If hover highlighting doesn't work:
- Check that the `useNodeHoverHighlight` hook is being called
- Ensure event listeners are properly attached
- Verify that the hover events are being dispatched correctly

## Customization

### Styling the arrows:
Edit the handle styles in `DragDropEdgeHandler.tsx` around lines 70-150.

### Hover effects:
Modify the hover styling in `EnhancedCustomNode.tsx` and `EnhancedGroupNode.tsx`.

### Arrow positions:
Adjust the positioning of arrows by modifying the `top`, `right`, `bottom`, `left` CSS properties in the handle styles.

## Performance Notes

- The drag-to-connect functionality adds minimal overhead
- Hover detection uses efficient DOM hit-testing
- Event listeners are properly cleaned up on unmount
- Icons and styling changes are optimized with CSS transitions

