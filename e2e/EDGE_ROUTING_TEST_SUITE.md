# Edge Routing Test Suite

Comprehensive test suite for libavoid edge routing functionality.

## Test Categories

### 1. Basic Routing Tests
- **`should route edge between two nodes without obstacles`**: Tests basic edge creation and routing when there are no obstacles in the path.
- **`should route edge around single obstacle`**: Verifies that edges correctly route around a single obstacle node.
- **`should route edge around multiple obstacles`**: Tests routing when multiple obstacles are in the path.

### 2. Port-Based Routing Tests
- **`should separate multiple edges from same port`**: Ensures that when multiple edges originate from the same port on a node, they are properly spaced and don't overlap.
- **`should route edges to same target port with spacing`**: Tests that edges converging to the same target port are properly separated.

### 3. Dynamic Routing Tests
- **`should reroute edge when obstacle moves`**: Verifies that edges automatically reroute when an obstacle node is moved.
- **`should reroute edge when source node moves`**: Tests that edges update their path when the source node is moved.

### 4. Complex Scenario Tests
- **`should route edge through tight gap`**: Tests routing through narrow spaces between obstacles.
- **`should route long path with many obstacles`**: Verifies routing with many obstacles in sequence.
- **`should route edge in different directions`**: Tests horizontal, vertical, and diagonal routing scenarios.

### 5. Edge Interaction Tests
- **`should separate parallel edges`**: Ensures parallel edges (same source and target) are properly separated.
- **`should handle crossing edges`**: Tests that crossing edges route correctly without conflicts.

## Utility Functions

The test suite includes several utility functions:

- **`addNodeToCanvas(page, x, y, label?)`**: Adds a node to the canvas at specified coordinates.
- **`createEdgeBetweenNodes(page, sourceId, targetId)`**: Creates an edge between two nodes using the connector tool.
- **`getEdgePath(page, edgeId)`**: Retrieves the SVG path data for an edge.
- **`getNodeBounds(page, nodeId)`**: Gets the bounding box of a node.
- **`moveNode(page, nodeId, deltaX, deltaY)`**: Moves a node by a specified offset.
- **`parsePathPoints(pathData)`**: Parses SVG path data into coordinate points.
- **`countPathPoints(pathData)`**: Counts the number of points in a path.
- **`checkPathAvoidsObstacle(pathData, obstacleBounds)`**: Verifies that a path avoids an obstacle.

## Running the Tests

```bash
# Run all edge routing tests
npx playwright test e2e/edge-routing.test.ts

# Run a specific test
npx playwright test e2e/edge-routing.test.ts -g "should route edge around single obstacle"

# Run with UI mode for debugging
npx playwright test e2e/edge-routing.test.ts --ui
```

## Test Patterns

### Pattern 1: Basic Edge Creation
```typescript
// Add nodes
const node1Id = await addNodeToCanvas(page, 200, 200);
const node2Id = await addNodeToCanvas(page, 500, 200);

// Create edge
const edgeId = await createEdgeBetweenNodes(page, node1Id, node2Id);

// Verify routing
const pathData = await getEdgePath(page, edgeId);
expect(countPathPoints(pathData)).toBeGreaterThanOrEqual(2);
```

### Pattern 2: Obstacle Avoidance
```typescript
// Add nodes with obstacle
const sourceId = await addNodeToCanvas(page, 200, 200);
const obstacleId = await addNodeToCanvas(page, 350, 200);
const targetId = await addNodeToCanvas(page, 500, 200);

// Create edge
const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);

// Verify obstacle avoidance
const pathData = await getEdgePath(page, edgeId);
const obstacleBounds = await getNodeBounds(page, obstacleId);
expect(checkPathAvoidsObstacle(pathData, obstacleBounds)).toBe(true);
```

### Pattern 3: Port Spacing
```typescript
// Add nodes
const sourceId = await addNodeToCanvas(page, 200, 200);
const target1Id = await addNodeToCanvas(page, 400, 150);
const target2Id = await addNodeToCanvas(page, 400, 250);

// Create multiple edges from same source
const edge1Id = await createEdgeBetweenNodes(page, sourceId, target1Id);
const edge2Id = await createEdgeBetweenNodes(page, sourceId, target2Id);

// Verify no overlap
const path1 = await getEdgePath(page, edge1Id);
const path2 = await getEdgePath(page, edge2Id);
// Check for overlapping segments...
```

## Extending the Test Suite

To add new tests:

1. **Choose the appropriate category** (Basic, Port-Based, Dynamic, Complex, or Edge Interaction)
2. **Use the utility functions** to set up your test scenario
3. **Verify routing behavior** using path analysis functions
4. **Add assertions** to check specific routing requirements

### Example: Adding a New Test

```typescript
test('should route edge around nested obstacles', async ({ page }) => {
  test.setTimeout(30000);
  
  await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

  // Setup: Create nested obstacle scenario
  const sourceId = await addNodeToCanvas(page, 200, 200);
  const outerObstacleId = await addNodeToCanvas(page, 300, 200);
  const innerObstacleId = await addNodeToCanvas(page, 350, 200);
  const targetId = await addNodeToCanvas(page, 500, 200);

  // Create edge
  const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
  await page.waitForTimeout(2000);

  // Verify routing
  const pathData = await getEdgePath(page, edgeId);
  const outerBounds = await getNodeBounds(page, outerObstacleId);
  const innerBounds = await getNodeBounds(page, innerObstacleId);

  expect(checkPathAvoidsObstacle(pathData, outerBounds)).toBe(true);
  expect(checkPathAvoidsObstacle(pathData, innerBounds)).toBe(true);
});
```

## Notes

- All tests use a 30-second timeout to account for routing computation time
- Tests wait for routing to complete using `page.waitForTimeout(2000)` after edge creation
- The `checkPathAvoidsObstacle` function uses a 16px buffer (matching `shapeBufferDistance`)
- Path analysis functions work with SVG path data (M/L commands)

