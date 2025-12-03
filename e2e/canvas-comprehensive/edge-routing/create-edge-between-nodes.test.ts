import { test, expect } from '@playwright/test';
import { getBaseUrl } from '../../test-config.js';

/**
 * Test: Add two nodes and create edge between them
 * 
 * Verifies:
 * 1. Edge is visible immediately after creation
 * 2. Edge path connects the two nodes
 * 3. Edge persists after page refresh
 */

test.describe('Create Edge Between Nodes', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  test('should create visible edge between two nodes', async ({ page }) => {
    test.setTimeout(15000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add first node
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(200);

    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error('ReactFlow pane not found');

    await page.mouse.click(paneBox.x + 200, paneBox.y + 200);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');

    // Add second node
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(200);

    await page.mouse.click(paneBox.x + 500, paneBox.y + 200);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');

    // Wait for nodes
    await page.waitForFunction(
      () => document.querySelectorAll('.react-flow__node').length >= 2,
      { timeout: 5000 }
    );

    // Get node IDs and positions
    const nodeInfo = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
      return nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute('data-id'),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          right: rect.right,
          left: rect.left,
        };
      }).filter(n => n.id) as Array<{ id: string; x: number; y: number; right: number; left: number }>;
    });

    expect(nodeInfo.length).toBeGreaterThanOrEqual(2);
    const [node1, node2] = nodeInfo;

    // Select connector tool - ensure it's actually activated
    const prevEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
    const connectorButton = page.locator('button[aria-label="Add connector (C)"]');
    await connectorButton.click({ timeout: 5000 });
    
    // Wait for connector tool to be active - check multiple ways
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label="Add connector (C)"]');
        const isPressed = btn?.getAttribute('aria-pressed') === 'true';
        const hasSelectedClass = btn?.classList.contains('selected');
        const hasActiveClass = btn?.classList.contains('active');
        // Also check if connector dots are visible (indicates tool is active)
        const greenDots = Array.from(document.querySelectorAll('div')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundColor.includes('rgb(0, 255, 0)') || style.backgroundColor.includes('rgba(0, 255, 0');
        });
        return isPressed || hasSelectedClass || hasActiveClass || greenDots.length > 0;
      },
      { timeout: 3000 }
    );
    
    // Wait for connector dots
    const dotsFound = await page.waitForFunction(
      () => {
        const dots = Array.from(document.querySelectorAll('div')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundColor.includes('rgb(0, 255, 0)') || style.backgroundColor.includes('rgba(0, 255, 0');
        });
        return dots.length >= 2;
      },
      { timeout: 10000 }
    );
    const dotCount = await page.evaluate(() => {
      const dots = Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.backgroundColor.includes('rgb(0, 255, 0)') || style.backgroundColor.includes('rgba(0, 255, 0');
      });
      return dots.length;
    });
    console.log(`Found ${dotCount} connector dots`);

    // Get actual green connector dot positions (they're centered on node edges)
    const nodePositions = await page.evaluate(
      ([node1Id, node2Id]: [string, string]) => {
        const node1 = document.querySelector(`[data-id="${node1Id}"]`);
        const node2 = document.querySelector(`[data-id="${node2Id}"]`);
        if (!node1 || !node2) return null;
        const rect1 = node1.getBoundingClientRect();
        const rect2 = node2.getBoundingClientRect();
        
        // Find actual green dots
        const allDivs = Array.from(document.querySelectorAll('div'));
        const greenDots = allDivs.filter(el => {
          const style = window.getComputedStyle(el);
          const bg = style.backgroundColor;
          return bg.includes('rgb(0, 255, 0)') || bg.includes('rgba(0, 255, 0');
        });
        
        // Find source dot (right of node1)
        const sourceDot = greenDots.find(dot => {
          const r = dot.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          return Math.abs(cx - rect1.right) < 50 && Math.abs(cy - (rect1.top + rect1.height / 2)) < 50;
        });
        
        // Find target dot (left of node2)
        const targetDot = greenDots.find(dot => {
          const r = dot.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          return Math.abs(cx - rect2.left) < 50 && Math.abs(cy - (rect2.top + rect2.height / 2)) < 50;
        });
        
        if (sourceDot && targetDot) {
          const sr = sourceDot.getBoundingClientRect();
          const tr = targetDot.getBoundingClientRect();
          return {
            source: { x: sr.x + sr.width / 2, y: sr.y + sr.height / 2 },
            target: { x: tr.x + tr.width / 2, y: tr.y + tr.height / 2 },
          };
        }
        
        // Fallback: use node edges
        return {
          source: { x: rect1.right, y: rect1.top + rect1.height / 2 },
          target: { x: rect2.left, y: rect2.top + rect2.height / 2 },
        };
      },
      [node1.id, node2.id] as [string, string]
    );

    if (!nodePositions) throw new Error('Could not find node positions');


    // Click source connector dot (right side of node1)
    await page.mouse.click(nodePositions.source.x, nodePositions.source.y, { delay: 100 });
    await page.waitForTimeout(1000); // Wait longer for state to propagate

    // Click target connector dot (left side of node2)  
    await page.mouse.click(nodePositions.target.x, nodePositions.target.y, { delay: 100 });

    // Fail fast: check immediately if edge was created (within 2 seconds)
    const edgeCreated = await page.waitForFunction(
      (previousCount) => {
        const edges = document.querySelectorAll('.react-flow__edge');
        return edges.length > previousCount;
      },
      prevEdgeCount,
      { timeout: 2000 }
    ).catch(() => null);

    if (!edgeCreated) {
      // Edge wasn't created - fail immediately with diagnostic info
      const diagnosticInfo = await page.evaluate(([node1Id, node2Id]) => {
        const node1 = document.querySelector(`[data-id="${node1Id}"]`);
        const node2 = document.querySelector(`[data-id="${node2Id}"]`);
        const edges = document.querySelectorAll('.react-flow__edge');
        const sourceHandles = document.querySelectorAll(`.react-flow__handle[data-nodeid="${node1Id}"]`);
        const targetHandles = document.querySelectorAll(`.react-flow__handle[data-nodeid="${node2Id}"]`);
        
      // Check if connector tool is active by checking button style (blue background)
      const connectorBtn = document.querySelector('button[aria-label="Add connector (C)"]');
      const btnStyle = connectorBtn ? window.getComputedStyle(connectorBtn) : null;
      const connectorToolActive = btnStyle?.backgroundColor.includes('rgb(66, 133, 244)') || false;
      
      // Check for blue dots (indicates connectingFrom is set)
      const blueDots = Array.from(document.querySelectorAll('div')).filter(el => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        return bg.includes('rgb(66, 133, 244)') || bg.includes('rgba(66, 133, 244');
      });
      
      return {
        edgeCount: edges.length,
        node1Exists: !!node1,
        node2Exists: !!node2,
        sourceHandleCount: sourceHandles.length,
        targetHandleCount: targetHandles.length,
        connectorToolActive,
        blueDotCount: blueDots.length,
      };
      }, [node1.id, node2.id]);
      
      throw new Error(`Edge was not created after clicking target port. Diagnostic: ${JSON.stringify(diagnosticInfo)}`);
    }

    // Edge was created - now verify it's visible (quick check, fail fast)
    const edgeVisible = await page.waitForFunction(
      (previousCount) => {
        const edges = document.querySelectorAll('.react-flow__edge');
        if (edges.length <= previousCount) return false;
        
        const lastEdge = edges[edges.length - 1];
        const path = lastEdge.querySelector('.react-flow__edge-path') as SVGPathElement;
        if (!path) return false;
        
        const pathData = path.getAttribute('d') || '';
        if (pathData.length === 0) return false;
        
        const style = window.getComputedStyle(path);
        const strokeWidth = parseFloat(style.strokeWidth) || 0;
        const opacity = parseFloat(style.opacity) || 1;
        
        return pathData.length > 0 && strokeWidth > 0 && opacity > 0 && 
               style.display !== 'none' && style.visibility !== 'hidden';
      },
      prevEdgeCount,
      { timeout: 3000 }
    ).catch(() => null);

    if (!edgeVisible) {
      throw new Error('Edge was created but is not visible on canvas');
    }

    // Wait for routing to complete
    await page.waitForTimeout(4000);

    // Verify edge is visible and connects the nodes
    const edgeInfo = await page.evaluate(([node1Id, node2Id]: [string, string]) => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      const lastEdge = edges[edges.length - 1];
      if (!lastEdge) return null;

      const path = lastEdge.querySelector('.react-flow__edge-path') as SVGPathElement;
      if (!path) return null;
      
      const pathData = path.getAttribute('d') || '';
      const coords = pathData.match(/[\d.]+/g) || [];
      const points: Array<{ x: number; y: number }> = [];
      
      for (let i = 0; i < coords.length; i += 2) {
        if (i + 1 < coords.length) {
          points.push({ x: parseFloat(coords[i]), y: parseFloat(coords[i + 1]) });
        }
      }
      
      // Check visibility
      const style = window.getComputedStyle(path);
      const strokeWidth = parseFloat(style.strokeWidth) || 0;
      const opacity = parseFloat(style.opacity) || 1;
      const display = style.display;
      const visibility = style.visibility;
      
      // Get node positions for connection verification
      const node1 = document.querySelector(`[data-id="${node1Id}"]`);
      const node2 = document.querySelector(`[data-id="${node2Id}"]`);
      const node1Rect = node1?.getBoundingClientRect();
      const node2Rect = node2?.getBoundingClientRect();
      
      return {
        exists: true,
        pathData,
        pointCount: points.length,
        points,
        isVisible: pathData.length > 0 && strokeWidth > 0 && opacity > 0 && display !== 'none' && visibility !== 'hidden',
        strokeWidth,
        opacity,
        node1Bounds: node1Rect ? { x: node1Rect.x, y: node1Rect.y, right: node1Rect.right, bottom: node1Rect.bottom } : null,
        node2Bounds: node2Rect ? { x: node2Rect.x, y: node2Rect.y, right: node2Rect.right, bottom: node2Rect.bottom } : null,
      };
    }, [node1.id, node2.id] as [string, string]);

    expect(edgeInfo).toBeTruthy();
    expect(edgeInfo?.exists).toBe(true);
    expect(edgeInfo?.pathData).toBeTruthy();
    expect(edgeInfo?.pathData.length).toBeGreaterThan(0);
    expect(edgeInfo?.pointCount).toBeGreaterThanOrEqual(2);
    expect(edgeInfo?.isVisible).toBe(true);
    expect(edgeInfo?.strokeWidth).toBeGreaterThan(0);
    expect(edgeInfo?.opacity).toBeGreaterThan(0);

    // Verify path connects the nodes (path should start near node1 and end near node2)
    if (edgeInfo?.points && edgeInfo.points.length >= 2 && edgeInfo.node1Bounds && edgeInfo.node2Bounds) {
      const firstPoint = edgeInfo.points[0];
      const lastPoint = edgeInfo.points[edgeInfo.points.length - 1];
      
      // First point should be near node1 (within 100px)
      const distToNode1 = Math.hypot(
        firstPoint.x - (edgeInfo.node1Bounds.x + (edgeInfo.node1Bounds.right - edgeInfo.node1Bounds.x) / 2),
        firstPoint.y - (edgeInfo.node1Bounds.y + (edgeInfo.node1Bounds.bottom - edgeInfo.node1Bounds.y) / 2)
      );
      
      // Last point should be near node2 (within 100px)
      const distToNode2 = Math.hypot(
        lastPoint.x - (edgeInfo.node2Bounds.x + (edgeInfo.node2Bounds.right - edgeInfo.node2Bounds.x) / 2),
        lastPoint.y - (edgeInfo.node2Bounds.y + (edgeInfo.node2Bounds.bottom - edgeInfo.node2Bounds.y) / 2)
      );
      
      expect(distToNode1).toBeLessThan(150); // Allow some tolerance
      expect(distToNode2).toBeLessThan(150);
    }

    // Verify edge persists after refresh
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000);

    const edgesAfterRefresh = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      return edges.map(edge => {
        const path = edge.querySelector('.react-flow__edge-path') as SVGPathElement;
        const pathData = path?.getAttribute('d') || '';
        const style = path ? window.getComputedStyle(path) : null;
        const strokeWidth = style ? parseFloat(style.strokeWidth) || 0 : 0;
        const opacity = style ? parseFloat(style.opacity) || 1 : 1;
        
        return {
          pathData,
          visible: pathData.length > 0 && strokeWidth > 0 && opacity > 0,
        };
      }).filter(e => e.visible);
    });

    expect(edgesAfterRefresh.length).toBeGreaterThan(0);
  });
});
