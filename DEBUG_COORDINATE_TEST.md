# 🧪 Coordinate Pipeline Debug Test

Test that CP1 coordinate changes work identically to before by adding a node and observing debug output.

## 🚀 Quick Test Commands

### 1. Start dev server with debug output:
```bash
npm run dev
# Open http://localhost:3000 or your dev URL
# Open browser console (F12)
```

### 2. Test without adapter (baseline):
```javascript
// In browser console - test current coordinate math
// This simulates the old inline math that was in ReactFlowAdapter

// Test relative to world conversion (child in group)
const childRelative = { x: 50, y: 30 };
const parentWorld = { x: 200, y: 150 };
const oldMath = {
  x: childRelative.x + parentWorld.x,
  y: childRelative.y + parentWorld.y
};
console.log('OLD MATH - relative to world:', oldMath);
// Should output: { x: 250, y: 180 }

// Test world to relative conversion (position child in group)
const childWorld = { x: 250, y: 180 };
const newParentWorld = { x: 200, y: 150 };
const oldMath2 = {
  x: childWorld.x - newParentWorld.x,
  y: childWorld.y - newParentWorld.y
};
console.log('OLD MATH - world to relative:', oldMath2);
// Should output: { x: 50, y: 30 }
```

### 3. Test with adapter (after integration):
```javascript
// In browser console - test new coordinate service
// This tests the new CoordinateService math

// Import is not available in console, but you can test via adapter
// The debug logs will show CoordinateService calls automatically

// Just add a node and watch debug output!
```

## 📊 Expected Debug Output

When you add a node (drag box tool, click canvas), you should see:

### Before adapter integration:
```
🔄 [MOVE-INTO-GROUP] Converting absolute to relative position: {
  nodeId: "new-node-123",
  parentId: undefined,
  absolutePos: "200,150", 
  relativePos: "200,150"
}
```

### After adapter integration:
```
🔧 [CanvasAdapter] Initializing ReactFlow adapter with config: {
  strictGeometry: true,
  gridSize: 16, 
  hasViewState: true
}
✅ [CanvasAdapter] ReactFlow adapter initialized successfully

🧮 [CoordinateService] toRelativeFromWorld: {
  childWorld: "250,180",
  parentWorld: "200,150", 
  relative: "50,30"
}

🔄 [MOVE-INTO-GROUP] Converting absolute to relative position: {
  nodeId: "new-node-123",
  absolutePos: "250,180",
  parentPos: "200,150",
  relativePos: "50,30"
}
```

## 🎯 Success Criteria

✅ **Math identical**: Same final positions before/after  
✅ **Debug output clean**: No errors in console  
✅ **Visual identical**: Node appears in same place  
✅ **Performance OK**: No noticeable slowdown  

### Expected coordinate flow:
1. User clicks canvas at screen position (e.g., 400, 300)
2. ReactFlow converts to flow position (snap to grid → 384, 304)
3. CoordinateService.snapPoint logs the snapping
4. If child node: CoordinateService.toRelativeFromWorld converts to relative
5. ReactFlowAdapter logs the conversion
6. Node renders at correct position

## 🔧 Step-by-Step Test

### Step 1: Add debugging (BEFORE integration):
```bash
# Run current version to get baseline debug output
npm run dev
# Add a node with box tool, note console output
```

### Step 2: Integrate adapter:
```tsx
// Add to your app wrapper (pages/_app.tsx or similar):
import { CanvasAdapterProvider } from '../client/core/renderer/CanvasAdapterProvider';

<CanvasAdapterProvider>
  <YourApp />
</CanvasAdapterProvider>

// Add to InteractiveCanvas.tsx:
import { useCanvasAdapterSetup } from '../../core/renderer/useCanvasAdapterSetup';

// Inside component:
const { isReady } = useCanvasAdapterSetup(reactFlowRef.current, viewStateRef.current);
console.log('🔧 [CP1-TEST] Adapter ready:', isReady);
```

### Step 3: Test (AFTER integration):
```bash
# Run with adapter integrated  
npm run dev
# Add a node with box tool, compare console output
# Should see CoordinateService debug logs + same final positions
```

### Step 4: Verify identical behavior:
- [ ] Node appears at same visual position
- [ ] Console shows CoordinateService calls
- [ ] Math results are identical
- [ ] No new errors
- [ ] All interactions still work

## 🚨 Red Flags

**Stop and investigate if you see:**
- ❌ Different final node positions
- ❌ Console errors about missing ViewState
- ❌ Significantly slower performance  
- ❌ Broken drag/drop interactions
- ❌ Missing CoordinateService debug logs (means adapter not working)

## 🔄 Rollback (if needed):

```tsx
// Remove these 2 lines if there are issues:
// <CanvasAdapterProvider> wrapper
// useCanvasAdapterSetup() hook call

// The app will work fine without them
```

## 🎮 Console Commands for Testing

```javascript
// Test coordinate math directly in console:

// 1. Test grid snapping (16px grid)
console.log('Snap 234 to grid:', Math.round(234 / 16) * 16); // Should be 240

// 2. Test world to relative  
const world = { x: 250, y: 180 };
const parent = { x: 200, y: 150 };
const relative = { x: world.x - parent.x, y: world.y - parent.y };
console.log('World to relative:', relative); // Should be { x: 50, y: 30 }

// 3. Test relative to world
const childRel = { x: 50, y: 30 };
const parentWorld = { x: 200, y: 150 };  
const childWorld = { x: childRel.x + parentWorld.x, y: childRel.y + parentWorld.y };
console.log('Relative to world:', childWorld); // Should be { x: 250, y: 180 }
```

**The math should be identical before and after CP1!**


