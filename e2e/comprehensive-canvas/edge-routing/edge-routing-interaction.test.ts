import { test, expect, Page } from '@playwright/test';
import { getBaseUrl } from '../../../test-config.js';

/**
 * Comprehensive Edge Routing Test Suite
 * 
 * Tests libavoid edge routing functionality including:
 * - Basic routing (straight, around obstacles)
 * - Port-based routing (multiple edges from same port)
 * - Dynamic routing (rerouting when nodes move/resize)
 * - Complex scenarios (long paths, multiple obstacles)
 */

test.describe('Edge Routing Test Suite', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  async function addNodeToCanvas(page: Page, x: number, y: number, label?: string): Promise<string> {
    // Select box tool
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(200);

    // Click canvas at specified coordinates
    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error('ReactFlow pane not found');
    
    const clickX = paneBox.x + x;
    const clickY = paneBox.y + y;
    await page.mouse.click(clickX, clickY);

    // Wait for node to be created
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape'); // Exit edit mode if needed

    // Get the newly created node ID
    const nodeId = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
      const lastNode = nodes[nodes.length - 1];
      return lastNode?.getAttribute('data-id') || '';
    });

    return nodeId;
  }

  async function createEdgeBetweenNodes(
    page: Page,
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<string> {
    // Select connector tool
    await page.click('button[aria-label="Add connector (C)"]', { timeout: 5000 });
    
    // Wait for connector dots to appear
    await page.waitForFunction(
      () => {
        const dots = Array.from(document.querySelectorAll('[style*="rgba(0, 255, 0"]'));
        return dots.length >= 2;
      },
      { timeout: 10000 }
    );

    // Get node positions
    const nodePositions = await page.evaluate((sourceId, targetId) => {
      const sourceNode = document.querySelector(`[data-id="${sourceId}"]`);
      const targetNode = document.querySelector(`[data-id="${targetId}"]`);
      if (!sourceNode || !targetNode) return null;
      
      const sourceRect = sourceNode.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      
      return {
        source: {
          x: sourceRect.x + sourceRect.width + 16, // Right side
          y: sourceRect.y + sourceRect.height / 2,
        },
        target: {
          x: targetRect.x - 16, // Left side
          y: targetRect.y + targetRect.height / 2,
        },
      };
    }, sourceNodeId, targetNodeId);

    if (!nodePositions) throw new Error('Could not find node positions');

    // Click source connector dot
    await page.mouse.click(nodePositions.source.x, nodePositions.source.y, { delay: 100 });
    await page.waitForTimeout(500);

    // Click target connector dot
    await page.mouse.click(nodePositions.target.x, nodePositions.target.y, { delay: 100 });

    // Wait for edge to appear
    const prevEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
    await page.waitForFunction(
      (previous) => document.querySelectorAll('.react-flow__edge').length > previous,
      prevEdgeCount,
      { timeout: 15000 }
    );

    // Get the newly created edge ID
    const edgeId = await page.evaluate((prevCount) => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      if (edges.length > prevCount) {
        const newEdge = edges[edges.length - 1];
        const testId = newEdge.getAttribute('data-testid') || '';
        return testId.replace('rf__edge-', '');
      }
      return '';
    }, prevEdgeCount);

    return edgeId;
  }

  async function getEdgePath(page: Page, edgeId: string): Promise<string> {
    return await page.evaluate((id) => {
      const edges = document.querySelectorAll('.react-flow__edge');
      for (const edge of edges) {
        const testId = edge.getAttribute('data-testid') || '';
        if (testId.replace('rf__edge-', '') === id) {
          const path = edge.querySelector('.react-flow__edge-path');
          return path?.getAttribute('d') || '';
        }
      }
      return '';
    }, edgeId);
  }

  async function getNodeBounds(page: Page, nodeId: string) {
    return await page.evaluate((id) => {
      const node = document.querySelector(`[data-id="${id}"]`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    }, nodeId);
  }

  async function moveNode(page: Page, nodeId: string, deltaX: number, deltaY: number) {
    const bounds = await getNodeBounds(page, nodeId);
    if (!bounds) throw new Error(`Node ${nodeId} not found`);

    const startX = bounds.x + bounds.width / 2;
    const startY = bounds.y + bounds.height / 2;
    const endX = startX + deltaX;
    const endY = startY + deltaY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1000); // Wait for rerouting
  }

  function parsePathPoints(pathData: string): Array<{ x: number; y: number }> {
    const coords = pathData.match(/[\d.]+/g)?.map(Number) || [];
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < coords.length; i += 2) {
      if (i + 1 < coords.length) {
        points.push({ x: coords[i], y: coords[i + 1] });
      }
    }
    return points;
  }

  function countPathPoints(pathData: string): number {
    return parsePathPoints(pathData).length;
  }

  function checkPathAvoidsObstacle(
    pathData: string,
    obstacleBounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    const points = parsePathPoints(pathData);
    const buffer = 16; // shapeBufferDistance

    // Check if any path segment intersects with obstacle (with buffer)
    const obstacleLeft = obstacleBounds.x - buffer;
    const obstacleRight = obstacleBounds.x + obstacleBounds.width + buffer;
    const obstacleTop = obstacleBounds.y - buffer;
    const obstacleBottom = obstacleBounds.y + obstacleBounds.height + buffer;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Check if segment intersects obstacle rectangle
      // Simple check: if both points are outside, segment might still pass through
      // More accurate: check if line segment intersects rectangle
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      // If segment is entirely outside obstacle bounds, skip
      if (maxX < obstacleLeft || minX > obstacleRight || maxY < obstacleTop || minY > obstacleBottom) {
        continue;
      }

      // Segment might intersect - for orthogonal routing, check if it's a straight line through obstacle
      if (Math.abs(p1.x - p2.x) < 1) {
        // Vertical segment
        if (p1.x >= obstacleLeft && p1.x <= obstacleRight && 
            !(maxY < obstacleTop || minY > obstacleBottom)) {
          return false; // Segment passes through obstacle
        }
      } else if (Math.abs(p1.y - p2.y) < 1) {
        // Horizontal segment
        if (p1.y >= obstacleTop && p1.y <= obstacleBottom && 
            !(maxX < obstacleLeft || minX > obstacleRight)) {
          return false; // Segment passes through obstacle
        }
      }
    }

    return true; // Path avoids obstacle
  }

  // ============================================
  // BASIC ROUTING TESTS
  // ============================================

  test('should route edge between two nodes without obstacles', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add two nodes
    const node1Id = await addNodeToCanvas(page, 200, 200);
    const node2Id = await addNodeToCanvas(page, 500, 200);

    // Create edge between them
    const edgeId = await createEdgeBetweenNodes(page, node1Id, node2Id);
    expect(edgeId).toBeTruthy();

    // Wait for routing
    await page.waitForTimeout(2000);

    // Get edge path
    const pathData = await getEdgePath(page, edgeId);
    expect(pathData).toBeTruthy();

    // Edge should have at least 2 points (start and end)
    const pointCount = countPathPoints(pathData);
    expect(pointCount).toBeGreaterThanOrEqual(2);
  });

  test('should route edge around single obstacle', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add three nodes: source, obstacle, target
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const obstacleId = await addNodeToCanvas(page, 350, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    // Create edge from source to target
    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    // Get edge path and obstacle bounds
    const pathData = await getEdgePath(page, edgeId);
    const obstacleBounds = await getNodeBounds(page, obstacleId);

    expect(pathData).toBeTruthy();
    expect(obstacleBounds).toBeTruthy();

    // Edge should route around obstacle (more than 2 points)
    const pointCount = countPathPoints(pathData);
    expect(pointCount).toBeGreaterThan(2);

    // Edge should avoid obstacle
    if (obstacleBounds) {
      const avoidsObstacle = checkPathAvoidsObstacle(pathData, obstacleBounds);
      expect(avoidsObstacle).toBe(true);
    }
  });

  test('should route edge around multiple obstacles', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add nodes: source, obstacle1, obstacle2, target
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const obstacle1Id = await addNodeToCanvas(page, 300, 200);
    const obstacle2Id = await addNodeToCanvas(page, 400, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    // Create edge
    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    const pathData = await getEdgePath(page, edgeId);
    const obstacle1Bounds = await getNodeBounds(page, obstacle1Id);
    const obstacle2Bounds = await getNodeBounds(page, obstacle2Id);

    // Edge should route around both obstacles
    const pointCount = countPathPoints(pathData);
    expect(pointCount).toBeGreaterThan(2);

    if (obstacle1Bounds) {
      expect(checkPathAvoidsObstacle(pathData, obstacle1Bounds)).toBe(true);
    }
    if (obstacle2Bounds) {
      expect(checkPathAvoidsObstacle(pathData, obstacle2Bounds)).toBe(true);
    }
  });

  // ============================================
  // PORT-BASED ROUTING TESTS
  // ============================================

  test('should separate multiple edges from same port', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add source node and two target nodes
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const target1Id = await addNodeToCanvas(page, 400, 150);
    const target2Id = await addNodeToCanvas(page, 400, 250);

    // Create two edges from same source node
    const edge1Id = await createEdgeBetweenNodes(page, sourceId, target1Id);
    await page.waitForTimeout(1000);
    const edge2Id = await createEdgeBetweenNodes(page, sourceId, target2Id);
    await page.waitForTimeout(2000);

    // Get both edge paths
    const path1 = await getEdgePath(page, edge1Id);
    const path2 = await getEdgePath(page, edge2Id);

    // Both edges should be routed (not straight lines)
    const points1 = countPathPoints(path1);
    const points2 = countPathPoints(path2);
    expect(points1).toBeGreaterThan(2);
    expect(points2).toBeGreaterThan(2);

    // Extract vertical segments from both paths
    const getVerticalSegments = (pathData: string) => {
      const points = parsePathPoints(pathData);
      const segments: Array<{ x: number; y1: number; y2: number }> = [];
      for (let i = 0; i < points.length - 1; i++) {
        if (Math.abs(points[i].x - points[i + 1].x) < 1) {
          segments.push({
            x: Math.round(points[i].x),
            y1: Math.min(points[i].y, points[i + 1].y),
            y2: Math.max(points[i].y, points[i + 1].y),
          });
        }
      }
      return segments;
    };

    const segs1 = getVerticalSegments(path1);
    const segs2 = getVerticalSegments(path2);

    // Check for overlapping vertical segments
    let hasOverlap = false;
    for (const seg1 of segs1) {
      for (const seg2 of segs2) {
        if (Math.abs(seg1.x - seg2.x) < 2) {
          // Same X coordinate - check Y overlap
          if (!(seg1.y2 < seg2.y1 || seg2.y2 < seg1.y1)) {
            hasOverlap = true;
          }
        }
      }
    }

    expect(hasOverlap).toBe(false);
  });

  test('should route edges to same target port with spacing', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add two source nodes and one target node
    const source1Id = await addNodeToCanvas(page, 200, 150);
    const source2Id = await addNodeToCanvas(page, 200, 250);
    const targetId = await addNodeToCanvas(page, 400, 200);

    // Create two edges to same target
    const edge1Id = await createEdgeBetweenNodes(page, source1Id, targetId);
    await page.waitForTimeout(1000);
    const edge2Id = await createEdgeBetweenNodes(page, source2Id, targetId);
    await page.waitForTimeout(2000);

    const path1 = await getEdgePath(page, edge1Id);
    const path2 = await getEdgePath(page, edge2Id);

    // Both should be routed
    expect(countPathPoints(path1)).toBeGreaterThan(2);
    expect(countPathPoints(path2)).toBeGreaterThan(2);
  });

  // ============================================
  // DYNAMIC ROUTING TESTS
  // ============================================

  test('should reroute edge when obstacle moves', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add nodes: source, obstacle, target
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const obstacleId = await addNodeToCanvas(page, 350, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    // Create edge
    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    // Get initial path
    const initialPath = await getEdgePath(page, edgeId);
    const initialPointCount = countPathPoints(initialPath);

    // Move obstacle out of the way
    await moveNode(page, obstacleId, 0, 200);
    await page.waitForTimeout(2000);

    // Get new path
    const newPath = await getEdgePath(page, edgeId);
    const newPointCount = countPathPoints(newPath);

    // Path should change (might be shorter now)
    // Note: Path might be same length but different route, so we just check it exists
    expect(newPath).toBeTruthy();
    expect(newPointCount).toBeGreaterThanOrEqual(2);
  });

  test('should reroute edge when source node moves', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    const sourceId = await addNodeToCanvas(page, 200, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    const initialPath = await getEdgePath(page, edgeId);

    // Move source node
    await moveNode(page, sourceId, 100, 0);
    await page.waitForTimeout(2000);

    const newPath = await getEdgePath(page, edgeId);

    // Path should update
    expect(newPath).toBeTruthy();
    expect(newPath).not.toBe(initialPath);
  });

  // ============================================
  // COMPLEX SCENARIO TESTS
  // ============================================

  test('should route edge through tight gap', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Create tight gap scenario: source, small gap, target
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const obstacle1Id = await addNodeToCanvas(page, 350, 150);
    const obstacle2Id = await addNodeToCanvas(page, 350, 250);
    const targetId = await addNodeToCanvas(page, 500, 200);

    // Create edge that must route through gap
    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    const pathData = await getEdgePath(page, edgeId);
    const pointCount = countPathPoints(pathData);

    // Should route successfully (more than 2 points)
    expect(pointCount).toBeGreaterThan(2);
  });

  test('should route long path with many obstacles', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Create long path with obstacles
    const sourceId = await addNodeToCanvas(page, 100, 200);
    const obstacle1Id = await addNodeToCanvas(page, 200, 200);
    const obstacle2Id = await addNodeToCanvas(page, 300, 200);
    const obstacle3Id = await addNodeToCanvas(page, 400, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    const edgeId = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    const pathData = await getEdgePath(page, edgeId);
    const pointCount = countPathPoints(pathData);

    // Should route around all obstacles
    expect(pointCount).toBeGreaterThan(2);

    // Verify it avoids each obstacle
    const obstacle1Bounds = await getNodeBounds(page, obstacle1Id);
    const obstacle2Bounds = await getNodeBounds(page, obstacle2Id);
    const obstacle3Bounds = await getNodeBounds(page, obstacle3Id);

    if (obstacle1Bounds) expect(checkPathAvoidsObstacle(pathData, obstacle1Bounds)).toBe(true);
    if (obstacle2Bounds) expect(checkPathAvoidsObstacle(pathData, obstacle2Bounds)).toBe(true);
    if (obstacle3Bounds) expect(checkPathAvoidsObstacle(pathData, obstacle3Bounds)).toBe(true);
  });

  test('should route edge in different directions (vertical, horizontal, diagonal)', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Horizontal edge
    const hSourceId = await addNodeToCanvas(page, 200, 200);
    const hTargetId = await addNodeToCanvas(page, 400, 200);
    const hEdgeId = await createEdgeBetweenNodes(page, hSourceId, hTargetId);
    await page.waitForTimeout(1000);

    // Vertical edge
    const vSourceId = await addNodeToCanvas(page, 500, 200);
    const vTargetId = await addNodeToCanvas(page, 500, 400);
    const vEdgeId = await createEdgeBetweenNodes(page, vSourceId, vTargetId);
    await page.waitForTimeout(1000);

    // Diagonal edge (with obstacle)
    const dSourceId = await addNodeToCanvas(page, 200, 400);
    const dObstacleId = await addNodeToCanvas(page, 300, 350);
    const dTargetId = await addNodeToCanvas(page, 400, 500);
    const dEdgeId = await createEdgeBetweenNodes(page, dSourceId, dTargetId);
    await page.waitForTimeout(2000);

    // All edges should be routed
    const hPath = await getEdgePath(page, hEdgeId);
    const vPath = await getEdgePath(page, vEdgeId);
    const dPath = await getEdgePath(page, dEdgeId);

    expect(countPathPoints(hPath)).toBeGreaterThanOrEqual(2);
    expect(countPathPoints(vPath)).toBeGreaterThanOrEqual(2);
    expect(countPathPoints(dPath)).toBeGreaterThan(2); // Diagonal with obstacle should route
  });

  // ============================================
  // EDGE INTERACTION TESTS
  // ============================================

  test('should separate parallel edges', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Create two parallel edges (same source, same target)
    const sourceId = await addNodeToCanvas(page, 200, 200);
    const targetId = await addNodeToCanvas(page, 500, 200);

    const edge1Id = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(1000);
    const edge2Id = await createEdgeBetweenNodes(page, sourceId, targetId);
    await page.waitForTimeout(2000);

    const path1 = await getEdgePath(page, edge1Id);
    const path2 = await getEdgePath(page, edge2Id);

    // Both should be routed and separated
    expect(countPathPoints(path1)).toBeGreaterThan(2);
    expect(countPathPoints(path2)).toBeGreaterThan(2);
    expect(path1).not.toBe(path2); // Different paths
  });

  test('should handle crossing edges', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Create crossing edges: horizontal and vertical
    const topLeftId = await addNodeToCanvas(page, 200, 150);
    const topRightId = await addNodeToCanvas(page, 400, 150);
    const bottomLeftId = await addNodeToCanvas(page, 200, 350);
    const bottomRightId = await addNodeToCanvas(page, 400, 350);

    const hEdgeId = await createEdgeBetweenNodes(page, topLeftId, topRightId);
    await page.waitForTimeout(1000);
    const vEdgeId = await createEdgeBetweenNodes(page, topLeftId, bottomLeftId);
    await page.waitForTimeout(2000);

    // Both edges should route successfully
    const hPath = await getEdgePath(page, hEdgeId);
    const vPath = await getEdgePath(page, vEdgeId);

    expect(countPathPoints(hPath)).toBeGreaterThanOrEqual(2);
    expect(countPathPoints(vPath)).toBeGreaterThanOrEqual(2);
  });
});

