import { test, expect } from '@playwright/test';
import { getBaseUrl } from '../../test-config.js';

/**
 * Test: Edge rerouting when node is moved
 * 
 * Verifies:
 * 1. Edge is created between two nodes
 * 2. When one node is dragged, the edge reroutes dynamically
 * 3. No errors occur during rerouting
 * 4. Edge path updates correctly after node movement
 */

test.describe('Edge Reroute on Node Move', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  test('should reroute edge when node is dragged and moved', async ({ page }) => {
    test.setTimeout(20000);
    
    await page.goto(`${BASE_URL}/canvas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });

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

    expect(nodeInfo.length).toBeGreaterThanOrEqual(2);
    const [node1, node2] = nodeInfo;

    // Select connector tool
    const prevEdgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
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

    // Verify edge was created
    const edgeCount = await page.evaluate(() => document.querySelectorAll('.react-flow__edge').length);
    expect(edgeCount).toBeGreaterThan(prevEdgeCount);

    // Get initial edge path
    const initialPath = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge path'));
      if (edges.length === 0) return null;
      const path = edges[0] as SVGPathElement;
      return path.getAttribute('d');
    });
    expect(initialPath).not.toBeNull();

    // Track any errors during node movement
    const errors: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('error') || text.includes('Error') || text.includes('aborted') || text.includes('routing error')) {
        errors.push(text);
      }
    });

    // Get node1 element for dragging
    const node1Element = page.locator(`[data-id="${node1.id}"]`).first();
    const node1Box = await node1Element.boundingBox();
    if (!node1Box) throw new Error('Node1 not found');

    // Drag node1 to a new position (move it 200px to the right and 100px down)
    const dragStartX = node1Box.x + node1Box.width / 2;
    const dragStartY = node1Box.y + node1Box.height / 2;
    const dragEndX = dragStartX + 200;
    const dragEndY = dragStartY + 100;

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.waitForTimeout(100); // Small delay for drag start
    await page.mouse.move(dragEndX, dragEndY, { steps: 10 });
    await page.waitForTimeout(500); // Allow rerouting during drag
    await page.mouse.up();
    await page.waitForTimeout(2000); // Wait for rerouting to complete

    // Verify edge path changed (rerouted)
    const finalPath = await page.evaluate(() => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge path'));
      if (edges.length === 0) return null;
      const path = edges[0] as SVGPathElement;
      return path.getAttribute('d');
    });
    expect(finalPath).not.toBeNull();
    expect(finalPath).not.toBe(initialPath);

    // Verify no routing errors occurred
    const routingErrors = errors.filter(e => 
      e.includes('routing error') || 
      e.includes('aborted') || 
      e.includes('StepEdge') && e.includes('error')
    );
    expect(routingErrors.length).toBe(0);

    // Verify edge still connects the same nodes
    const edgeStillConnects = await page.evaluate(([node1Id, node2Id]) => {
      const edges = Array.from(document.querySelectorAll('.react-flow__edge'));
      if (edges.length === 0) return false;
      const edge = edges[0] as any;
      const rfEdge = edge.__rf?.edge;
      return rfEdge?.source === node1Id && rfEdge?.target === node2Id;
    }, [node1.id, node2.id]);
    expect(edgeStillConnects).toBe(true);

    // Verify edge path is valid (has points)
    const pathCommands = finalPath?.match(/[ML][\d.-]+ [\d.-]+/g) || [];
    expect(pathCommands.length).toBeGreaterThanOrEqual(2);
  });
});

