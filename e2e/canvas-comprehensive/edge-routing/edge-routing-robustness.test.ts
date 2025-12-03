import { test, expect } from '@playwright/test';
import { getBaseUrl } from '../../test-config.js';

/**
 * Edge Routing Robustness Tests
 * 
 * Tests for:
 * 1. Port position persistence on refresh
 * 2. Libavoid abort error handling
 * 3. Fallback routing when libavoid fails
 */

test.describe('Edge Routing Robustness', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  test('should preserve port positions after page refresh', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add two nodes
    const node1Id = await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
      return `user-node-${Date.now()}`;
    });
    await page.waitForTimeout(200);

    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error('ReactFlow pane not found');

    await page.mouse.click(paneBox.x + 200, paneBox.y + 200);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');

    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(200);

    await page.mouse.click(paneBox.x + 400, paneBox.y + 200);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');

    await page.waitForTimeout(1000);

    // Wait for nodes
    await page.waitForFunction(
      () => document.querySelectorAll('.react-flow__node').length >= 2,
      { timeout: 5000 }
    );

    // Get node IDs and positions (same pattern as working test)
    const nodeInfo = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
      return nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute('data-id'),
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
          },
        };
      });
    });

    if (nodeInfo.length < 2) throw new Error('Not enough nodes');

    const node1 = nodeInfo[0];
    const node2 = nodeInfo[1];

    // Activate connector tool (same pattern as working test)
    const connectorButton = page.locator('button[aria-label="Add connector (C)"]');
    await connectorButton.click({ timeout: 5000 });
    
    // Wait for connector tool to be active
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[aria-label="Add connector (C)"]');
        const isPressed = btn?.getAttribute('aria-pressed') === 'true';
        const greenDots = Array.from(document.querySelectorAll('div')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.backgroundColor.includes('rgb(0, 255, 0)') || style.backgroundColor.includes('rgba(0, 255, 0');
        });
        return isPressed || greenDots.length > 0;
      },
      { timeout: 3000 }
    );

    // Create edge by clicking connector dots
    await page.mouse.click(node1.rect.right + 32, node1.rect.top + node1.rect.height / 2, { delay: 100 });
    await page.waitForTimeout(1000);
    await page.mouse.click(node2.rect.left - 32, node2.rect.top + node2.rect.height / 2, { delay: 100 });
    await page.waitForTimeout(2000);

    // Wait for edge to be created
    await page.waitForSelector('.react-flow__edge', { timeout: 5000 });
    await page.waitForTimeout(1000); // Give time for data to be set
    
    // Get edge data before refresh
    const edgeDataBefore = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      if (edges.length === 0) return null;
      const edge = edges[0] as any;
      const edgeData = edge.__rf?.edge?.data;
      const rfEdge = edge.__rf?.edge;
      // Derive positions from handles if not in data
      const sourceHandle = edgeData?.sourceHandle || rfEdge?.sourceHandle || '';
      const targetHandle = edgeData?.targetHandle || rfEdge?.targetHandle || '';
      const sourcePosition = edgeData?.sourcePosition || 
        (sourceHandle.includes('top') ? 'top' :
         sourceHandle.includes('bottom') ? 'bottom' :
         sourceHandle.includes('left') ? 'left' : 
         sourceHandle.includes('right') ? 'right' : 'right');
      const targetPosition = edgeData?.targetPosition ||
        (targetHandle.includes('top') ? 'top' :
         targetHandle.includes('bottom') ? 'bottom' :
         targetHandle.includes('left') ? 'left' :
         targetHandle.includes('right') ? 'right' : 'left');
      
      return {
        sourcePosition,
        targetPosition,
        sourceHandle,
        targetHandle,
      };
    });

    expect(edgeDataBefore).not.toBeNull();
    expect(edgeDataBefore?.sourcePosition).toBeTruthy();
    expect(edgeDataBefore?.targetPosition).toBeTruthy();

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    await page.waitForTimeout(3000); // Wait for restoration

    // Wait for edge to be restored
    await page.waitForSelector('.react-flow__edge', { timeout: 10000 });
    await page.waitForTimeout(2000); // Give time for restoration
    
    // Get edge data after refresh
    const edgeDataAfter = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      if (edges.length === 0) return null;
      const edge = edges[0] as any;
      const edgeData = edge.__rf?.edge?.data;
      const rfEdge = edge.__rf?.edge;
      // Derive positions from handles if not in data
      const sourceHandle = edgeData?.sourceHandle || rfEdge?.sourceHandle || '';
      const targetHandle = edgeData?.targetHandle || rfEdge?.targetHandle || '';
      const sourcePosition = edgeData?.sourcePosition || 
        (sourceHandle.includes('top') ? 'top' :
         sourceHandle.includes('bottom') ? 'bottom' :
         sourceHandle.includes('left') ? 'left' : 
         sourceHandle.includes('right') ? 'right' : 'right');
      const targetPosition = edgeData?.targetPosition ||
        (targetHandle.includes('top') ? 'top' :
         targetHandle.includes('bottom') ? 'bottom' :
         targetHandle.includes('left') ? 'left' :
         targetHandle.includes('right') ? 'right' : 'left');
      
      return {
        sourcePosition,
        targetPosition,
        sourceHandle,
        targetHandle,
      };
    });

    expect(edgeDataAfter).not.toBeNull();
    expect(edgeDataAfter?.sourcePosition).toBe(edgeDataBefore?.sourcePosition);
    expect(edgeDataAfter?.targetPosition).toBe(edgeDataBefore?.targetPosition);
  });

  test('should handle libavoid abort errors gracefully', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add multiple nodes and edges rapidly to trigger potential race conditions
    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error('ReactFlow pane not found');

    // Add 3 nodes
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const btn = document.querySelector('button[title*="box" i]');
        if (btn) {
          btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      });
      await page.waitForTimeout(100);
      await page.mouse.click(paneBox.x + 200 + i * 200, paneBox.y + 200);
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Activate connector tool
    await page.click('button[aria-label*="connector" i]');
    await page.waitForTimeout(500);

    // Create edges rapidly
    const errors: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      // Only count unhandled errors - handled abort errors are OK
      if (text.includes('routing error') && !text.includes('Using smart fallback') && !text.includes('Libavoid unavailable')) {
        errors.push(text);
      }
    });

    // Create edges between nodes
    const nodes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.react-flow__node')).map((n, i) => ({
        index: i,
        id: n.getAttribute('data-id'),
        rect: n.getBoundingClientRect(),
      }));
    });

    for (let i = 0; i < nodes.length - 1; i++) {
      const node1 = nodes[i];
      const node2 = nodes[i + 1];
      
      // Click source (right side of node1)
      await page.mouse.click(node1.rect.right + 16, node1.rect.top + node1.rect.height / 2);
      await page.waitForTimeout(300);
      
      // Click target (left side of node2)
      await page.mouse.click(node2.rect.left - 16, node2.rect.top + node2.rect.height / 2);
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(2000);

    // Verify edges were created successfully (abort errors are handled gracefully)
    const edgeCount = await page.evaluate(() => {
      return document.querySelectorAll('.react-flow__edge').length;
    });
    expect(edgeCount).toBeGreaterThan(0);
    
    // Verify no unhandled routing errors occurred
    const unhandledErrors = errors.filter(e => !e.includes('Using smart fallback') && !e.includes('Libavoid unavailable'));
    expect(unhandledErrors.length).toBe(0);
  });

  test('should use smart fallback when libavoid fails', async ({ page }) => {
    test.setTimeout(30000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

    // Add two nodes with a third node in between (to force routing around)
    const pane = page.locator('.react-flow__pane');
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error('ReactFlow pane not found');

    // Add source node (left)
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(100);
    await page.mouse.click(paneBox.x + 100, paneBox.y + 200);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    // Add obstacle node (middle)
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(100);
    await page.mouse.click(paneBox.x + 300, paneBox.y + 200);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    // Add target node (right)
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="box" i]');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await page.waitForTimeout(100);
    await page.mouse.click(paneBox.x + 500, paneBox.y + 200);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    await page.waitForTimeout(1000);

    // Activate connector tool first
    await page.click('button[aria-label*="connector" i]');
    await page.waitForTimeout(500);
    
    // Force libavoid to fail AFTER tool is activated but BEFORE creating edge
    await page.evaluate(() => {
      // Break libavoid by making the instance promise fail
      if (window.AvoidLib) {
        const originalLoad = window.AvoidLib.load;
        window.AvoidLib.load = () => Promise.reject(new Error('Simulated libavoid failure'));
      }
      // Also break any existing instance
      if ((window as any).libavoid) {
        delete (window as any).libavoid;
      }
      if ((window as any).Avoid) {
        delete (window as any).Avoid;
      }
    });
    await page.waitForTimeout(500);

    // Create edge from left to right (must route around middle node)
    const nodes = await page.evaluate(() => {
      const nodeElements = Array.from(document.querySelectorAll('.react-flow__node'));
      return nodeElements.map(n => ({
        id: n.getAttribute('data-id'),
        rect: n.getBoundingClientRect(),
      }));
    });

    const sourceNode = nodes[0];
    const targetNode = nodes[2];

    await page.mouse.click(sourceNode.rect.right + 16, sourceNode.rect.top + sourceNode.rect.height / 2);
    await page.waitForTimeout(500);
    await page.mouse.click(targetNode.rect.left - 16, targetNode.rect.top + targetNode.rect.height / 2);
    
    // Wait for edge to be created (should happen even if libavoid fails)
    await page.waitForSelector('.react-flow__edge', { timeout: 10000 });
    await page.waitForTimeout(3000); // Give time for routing/fallback
    
    // Verify edge exists and has a path
    const edgePath = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge path'));
      if (edges.length === 0) return null;
      const path = edges[0] as SVGPathElement;
      return path.getAttribute('d');
    });

    expect(edgePath).not.toBeNull();
    
    // Verify path has more than 2 points (not a straight line)
    const pathCommands = edgePath?.match(/[ML][\d.-]+ [\d.-]+/g) || [];
    expect(pathCommands.length).toBeGreaterThan(2);

    // Verify path doesn't pass through middle node (if we can get node positions)
    const middleNodeInfo = await page.evaluate(() => {
      const nodeElements = Array.from(document.querySelectorAll('.react-flow__node'));
      if (nodeElements.length < 3) return null;
      const middleEl = nodeElements[1];
      const rect = middleEl.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    
    if (middleNodeInfo) {
      const pathPoints = pathCommands.map(cmd => {
        const match = cmd.match(/[\d.-]+/g);
        if (match && match.length >= 2) {
          return { x: parseFloat(match[0]), y: parseFloat(match[1]) };
        }
        return null;
      }).filter(p => p !== null) as { x: number; y: number }[];

      // Check if any path point is inside the middle node
      const passesThroughObstacle = pathPoints.some(point => {
        return point.x >= middleNodeInfo.left &&
               point.x <= middleNodeInfo.right &&
               point.y >= middleNodeInfo.top &&
               point.y <= middleNodeInfo.bottom;
      });

      expect(passesThroughObstacle).toBe(false);
    }
  });
});

