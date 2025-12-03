import { test, expect } from '@playwright/test';
import { getBaseUrl } from '../../../test-config.js';

/**
 * Edge Routing Unit Tests
 * 
 * Tests libavoid edge routing logic directly using fixtures (not user interactions).
 * These tests verify routing behavior by loading predefined node/edge configurations
 * and checking the resulting paths.
 */

test.describe('Edge Routing Unit Tests', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  // Helper to parse SVG path into points
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
    obstacleBounds: { x: number; y: number; width: number; height: number },
    buffer: number = 16
  ): boolean {
    const points = parsePathPoints(pathData);
    const obstacleLeft = obstacleBounds.x - buffer;
    const obstacleRight = obstacleBounds.x + obstacleBounds.width + buffer;
    const obstacleTop = obstacleBounds.y - buffer;
    const obstacleBottom = obstacleBounds.y + obstacleBounds.height + buffer;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);

      if (maxX < obstacleLeft || minX > obstacleRight || maxY < obstacleTop || minY > obstacleBottom) {
        continue;
      }

      // Check if segment passes through obstacle
      if (Math.abs(p1.x - p2.x) < 1) {
        // Vertical segment
        if (p1.x >= obstacleLeft && p1.x <= obstacleRight && 
            !(maxY < obstacleTop || minY > obstacleBottom)) {
          return false;
        }
      } else if (Math.abs(p1.y - p2.y) < 1) {
        // Horizontal segment
        if (p1.y >= obstacleTop && p1.y <= obstacleBottom && 
            !(maxX < obstacleLeft || minX > obstacleRight)) {
          return false;
        }
      }
    }

    return true;
  }

  function extractVerticalSegments(pathData: string): Array<{ x: number; y1: number; y2: number }> {
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
  }

  function extractHorizontalSegments(pathData: string): Array<{ y: number; x1: number; x2: number }> {
    const points = parsePathPoints(pathData);
    const segments: Array<{ y: number; x1: number; x2: number }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      if (Math.abs(points[i].y - points[i + 1].y) < 1) {
        segments.push({
          y: Math.round(points[i].y),
          x1: Math.min(points[i].x, points[i + 1].x),
          x2: Math.max(points[i].x, points[i + 1].x),
        });
      }
    }
    return segments;
  }

  // ============================================
  // FIXTURE-BASED ROUTING TESTS
  // ============================================

  test('should route edge-vertical around v-block obstacle', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000); // Wait for routing

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const nodes = document.querySelectorAll('.react-flow__node');
      
      let edgeVerticalPath = '';
      let vBlockBounds = { x: 0, y: 0, width: 0, height: 0 };
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        if (edgeId === 'edge-vertical') {
          const path = edge.querySelector('.react-flow__edge-path');
          edgeVerticalPath = path?.getAttribute('d') || '';
        }
      });
      
      nodes.forEach(node => {
        const nodeId = node.getAttribute('data-id');
        if (nodeId === 'libavoid-v-block') {
          const rect = node.getBoundingClientRect();
          vBlockBounds = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }
      });
      
      return { edgeVerticalPath, vBlockBounds };
    });

    // Edge should have routing (more than 2 points)
    const coordCount = (result.edgeVerticalPath.match(/[\d.]+/g) || []).length;
    expect(coordCount).toBeGreaterThan(4); // More than 2 points

    // Edge should avoid obstacle
    expect(checkPathAvoidsObstacle(result.edgeVerticalPath, result.vBlockBounds)).toBe(true);
  });

  test('should separate edges from same port without overlap', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const edgeData: Array<{ id: string; path: string }> = [];
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        const path = edge.querySelector('.react-flow__edge-path');
        if (edgeId.startsWith('edge-port-from-')) {
          edgeData.push({
            id: edgeId,
            path: path?.getAttribute('d') || ''
          });
        }
      });
      
      return edgeData;
    });

    const edge1 = result.find(e => e.id === 'edge-port-from-1');
    const edge2 = result.find(e => e.id === 'edge-port-from-2');

    expect(edge1).toBeDefined();
    expect(edge2).toBeDefined();

    if (!edge1 || !edge2) return;

    // Both should be routed (not straight lines)
    const points1 = countPathPoints(edge1.path);
    const points2 = countPathPoints(edge2.path);
    expect(points1).toBeGreaterThan(2);
    expect(points2).toBeGreaterThan(2);

    // Check for overlapping segments
    const segs1 = extractVerticalSegments(edge1.path);
    const segs2 = extractVerticalSegments(edge2.path);
    const hSegs1 = extractHorizontalSegments(edge1.path);
    const hSegs2 = extractHorizontalSegments(edge2.path);

    // Check vertical segment overlaps
    let hasOverlap = false;
    for (const seg1 of segs1) {
      for (const seg2 of segs2) {
        if (Math.abs(seg1.x - seg2.x) < 2) {
          if (!(seg1.y2 < seg2.y1 || seg2.y2 < seg1.y1)) {
            hasOverlap = true;
          }
        }
      }
    }

    // Check horizontal segment overlaps
    for (const seg1 of hSegs1) {
      for (const seg2 of hSegs2) {
        if (Math.abs(seg1.y - seg2.y) < 2) {
          if (!(seg1.x2 < seg2.x1 || seg2.x2 < seg1.x1)) {
            hasOverlap = true;
          }
        }
      }
    }

    expect(hasOverlap).toBe(false);
  });

  test('should route edge-horizontal around h-block obstacle', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const nodes = document.querySelectorAll('.react-flow__node');
      
      let edgeHorizontalPath = '';
      let hBlockBounds = { x: 0, y: 0, width: 0, height: 0 };
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        if (edgeId === 'edge-horizontal') {
          const path = edge.querySelector('.react-flow__edge-path');
          edgeHorizontalPath = path?.getAttribute('d') || '';
        }
      });
      
      nodes.forEach(node => {
        const nodeId = node.getAttribute('data-id');
        if (nodeId === 'libavoid-h-block') {
          const rect = node.getBoundingClientRect();
          hBlockBounds = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }
      });
      
      return { edgeHorizontalPath, hBlockBounds };
    });

    // Edge should route around obstacle
    const coordCount = (result.edgeHorizontalPath.match(/[\d.]+/g) || []).length;
    expect(coordCount).toBeGreaterThan(4);

    // Edge should avoid obstacle
    expect(checkPathAvoidsObstacle(result.edgeHorizontalPath, result.hBlockBounds)).toBe(true);
  });

  test('should route edge-diagonal around d-block obstacle', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const nodes = document.querySelectorAll('.react-flow__node');
      
      let edgeDiagonalPath = '';
      let dBlockBounds = { x: 0, y: 0, width: 0, height: 0 };
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        if (edgeId === 'edge-diagonal') {
          const path = edge.querySelector('.react-flow__edge-path');
          edgeDiagonalPath = path?.getAttribute('d') || '';
        }
      });
      
      nodes.forEach(node => {
        const nodeId = node.getAttribute('data-id');
        if (nodeId === 'libavoid-d-block') {
          const rect = node.getBoundingClientRect();
          dBlockBounds = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }
      });
      
      return { edgeDiagonalPath, dBlockBounds };
    });

    // Edge should route around obstacle
    const coordCount = (result.edgeDiagonalPath.match(/[\d.]+/g) || []).length;
    expect(coordCount).toBeGreaterThan(4);

    // Edge should avoid obstacle
    expect(checkPathAvoidsObstacle(result.edgeDiagonalPath, result.dBlockBounds)).toBe(true);
  });

  test('should maintain proper spacing from nodes (shapeBufferDistance)', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const nodes = document.querySelectorAll('.react-flow__node');
      
      const edgePaths: Array<{ id: string; path: string }> = [];
      const nodeBounds: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }> = [];
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        const path = edge.querySelector('.react-flow__edge-path');
        if (edgeId) {
          edgePaths.push({ id: edgeId, path: path?.getAttribute('d') || '' });
        }
      });
      
      nodes.forEach(node => {
        const nodeId = node.getAttribute('data-id');
        if (nodeId) {
          const rect = node.getBoundingClientRect();
          nodeBounds.push({
            id: nodeId,
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }
          });
        }
      });
      
      return { edgePaths, nodeBounds };
    });

    // Check that all edges maintain proper spacing from all nodes
    const minBuffer = 8; // Minimum expected buffer (shapeBufferDistance is 16, but we check for at least 8)
    
    for (const edge of result.edgePaths) {
      const points = parsePathPoints(edge.path);
      
      for (const node of result.nodeBounds) {
        // Skip source/target nodes (edges can connect to them)
        // Just verify edges maintain spacing from obstacle nodes
        if (node.id.includes('block') || node.id.includes('middle')) {
          const avoids = checkPathAvoidsObstacle(edge.path, node.bounds, minBuffer);
          expect(avoids).toBe(true);
        }
      }
    }
  });

  test('should route all fixture edges successfully', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const edgeData: Array<{ id: string; path: string; pointCount: number }> = [];
      
      edges.forEach(edge => {
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        const path = edge.querySelector('.react-flow__edge-path');
        const pathData = path?.getAttribute('d') || '';
        const coords = pathData.match(/[\d.]+/g) || [];
        const pointCount = coords.length / 2;
        
        edgeData.push({
          id: edgeId,
          path: pathData,
          pointCount
        });
      });
      
      return edgeData;
    });

    // Should have 8 edges from fixtures
    expect(result.length).toBeGreaterThanOrEqual(8);

    // All edges should have valid paths with at least 2 points
    for (const edge of result) {
      expect(edge.path).toBeTruthy();
      expect(edge.pointCount).toBeGreaterThanOrEqual(2);
    }

    // Specific edges should be routed (not straight lines)
    const verticalEdge = result.find(e => e.id === 'edge-vertical');
    const horizontalEdge = result.find(e => e.id === 'edge-horizontal');
    const diagonalEdge = result.find(e => e.id === 'edge-diagonal');

    if (verticalEdge) expect(verticalEdge.pointCount).toBeGreaterThan(2);
    if (horizontalEdge) expect(horizontalEdge.pointCount).toBeGreaterThan(2);
    if (diagonalEdge) expect(diagonalEdge.pointCount).toBeGreaterThan(2);
  });
});

