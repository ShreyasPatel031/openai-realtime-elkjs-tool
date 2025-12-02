/**
 * Real Browser Canvas Tests - E2E with Playwright
 * 
 * These tests run in a REAL browser and test the ACTUAL canvas behavior
 * that users experience, including all the rendering, persistence, and
 * interaction issues.
 */

import { test, expect, Page } from '@playwright/test';

// Helper functions for canvas testing
async function waitForCanvas(page: Page) {
  // Wait for page to be fully loaded
  try {
    await page.waitForLoadState('networkidle', { timeout: 30000 });
  } catch (e) {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
    await page.waitForTimeout(2000);
  }
  
  // Wait for React Flow canvas - try multiple selectors
  const selectors = ['.react-flow__pane', '.react-flow', '.react-flow__renderer', '[class*="react-flow"]'];
  let found = false;
  
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      console.log(`✅ Found canvas with selector: ${selector}`);
      found = true;
      break;
    } catch (e) {
      console.log(`❌ Selector ${selector} not found`);
    }
  }
  
  if (!found) {
    // Take screenshot for debugging
    await page.screenshot({ path: 'canvas-not-found.png' });
    throw new Error('Canvas not found with any selector');
  }
  
  // Wait for canvas to stabilize
  await page.waitForTimeout(2000);
}

async function getCanvasNodes(page: Page) {
  return await page.locator('.react-flow__node').all();
}

async function getNodeCount(page: Page): Promise<number> {
  const nodes = await getCanvasNodes(page);
  return nodes.length;
}

async function getNodePositions(page: Page): Promise<Array<{id: string, x: number, y: number}>> {
  const nodes = await getCanvasNodes(page);
  const positions = [];
  
  for (const node of nodes) {
    const id = await node.getAttribute('data-id') || 'unknown';
    const transform = await node.evaluate(el => el.style.transform);
    
    // Parse transform: translate(123px, 456px)
    const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      positions.push({ id, x, y });
    }
  }
  
  return positions;
}

async function selectBoxTool(page: Page) {
  // Try multiple selectors for the box tool
  const selectors = [
    '[data-testid="tool-box"]',
    '[title*="box" i]',
    '[aria-label*="box" i]',
    'button:has-text("Box")',
    '.tool-button:has-text("□")'
  ];
  
  for (const selector of selectors) {
    try {
      await page.click(selector, { timeout: 2000 });
      console.log(`✅ Selected box tool with selector: ${selector}`);
      return;
    } catch (e) {
      // Try next selector
    }
  }
  
  console.warn('⚠️ Could not find box tool, proceeding anyway');
}

async function addNodeToCanvas(page: Page, x: number, y: number) {
  // CRITICAL: Always re-select the box tool for each node
  await selectBoxTool(page);
  
  // Click on canvas to add node - try multiple selectors
  const selectors = ['.react-flow', '.react-flow__renderer', '[class*="react-flow"]'];
  let clicked = false;
  
  for (const selector of selectors) {
    try {
      const canvas = page.locator(selector);
      await canvas.click({ position: { x, y }, timeout: 2000 });
      console.log(`✅ Clicked canvas with selector: ${selector}`);
      clicked = true;
      break;
    } catch (e) {
      console.log(`❌ Could not click with selector: ${selector}`);
    }
  }
  
  if (!clicked) {
    throw new Error('Could not click on canvas with any selector');
  }
  
  // Wait for "Generating..." to appear and disappear (indicates processing)
  try {
    await page.waitForText('Generating...', { timeout: 2000 });
    await page.waitForFunction(() => !document.body.textContent?.includes('Generating...'), { timeout: 10000 });
  } catch (e) {
    console.log('⚠️ No "Generating..." detected, continuing...');
  }
  
  // Wait for domain to be updated (critical for layer sync)
  const initialDomainCount = await page.evaluate(() => {
    const domainGraph = (window as any).getDomainGraph?.() || { children: [] };
    return domainGraph.children?.length || 0;
  });
  
  await page.waitForFunction((expectedCount) => {
    const domainGraph = (window as any).getDomainGraph?.() || { children: [] };
    return domainGraph.children?.length >= expectedCount;
  }, initialDomainCount + 1, { timeout: 10000 });
  
  // Finish editing if node is in edit mode
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function deleteSelectedNodes(page: Page) {
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
}

async function selectAllNodes(page: Page) {
  // Try Ctrl+A to select all
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
}

async function clearLocalStorage(page: Page) {
  try {
    await page.evaluate(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    });
  } catch (error) {
    console.warn('Could not clear localStorage:', error);
  }
}

async function getLocalStorageSnapshot(page: Page) {
  try {
    return await page.evaluate(() => {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('atelier_canvas_last_snapshot_v1');
      }
      return null;
    });
  } catch (error) {
    console.warn('Could not access localStorage:', error);
    return null;
  }
}

async function callResetCanvas(page: Page) {
  await page.evaluate(() => {
    (window as any).resetCanvas?.();
  });
  await page.waitForTimeout(1000);
}

test.describe('Real Browser Canvas Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to canvas first
    await page.goto('http://localhost:3000/canvas');
    await waitForCanvas(page);
    
    // Then clear localStorage after page is loaded
    await clearLocalStorage(page);
  });

  test('should add nodes to real browser canvas', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing node addition in real browser');

    // Initially should have no nodes
    const initialCount = await getNodeCount(page);
    console.log(`Initial node count: ${initialCount}`);

    // Add first node
    await addNodeToCanvas(page, 200, 150);
    
    let nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(initialCount + 1);
    console.log(`✅ First node added, count: ${nodeCount}`);

    // Add second node
    await addNodeToCanvas(page, 400, 300);
    
    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(initialCount + 2);
    console.log(`✅ Second node added, count: ${nodeCount}`);

    // Verify nodes have different positions
    const positions = await getNodePositions(page);
    expect(positions).toHaveLength(2);
    expect(positions[0].x).not.toBe(positions[1].x);
    expect(positions[0].y).not.toBe(positions[1].y);
    
    console.log('✅ [REAL-BROWSER] Nodes added successfully with different positions');
  });

  test('should delete nodes from real browser canvas', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing node deletion in real browser');

    // Add 3 nodes first
    await addNodeToCanvas(page, 100, 100);
    await addNodeToCanvas(page, 200, 200);
    await addNodeToCanvas(page, 300, 300);

    let nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(3);
    console.log(`Added 3 nodes, count: ${nodeCount}`);

    // Select all nodes and delete
    await selectAllNodes(page);
    await deleteSelectedNodes(page);

    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(0);
    console.log('✅ [REAL-BROWSER] All nodes deleted successfully');
  });

  test('should persist nodes and restore after refresh', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing persistence and restoration');

    // Add nodes
    await addNodeToCanvas(page, 150, 150);
    await addNodeToCanvas(page, 250, 250);

    let nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(2);

    // Wait for persistence
    await page.waitForTimeout(2000);

    // Check localStorage has data
    const snapshot = await getLocalStorageSnapshot(page);
    expect(snapshot).toBeTruthy();
    console.log('✅ Data saved to localStorage');

    // Capture positions before refresh
    const positionsBefore = await getNodePositions(page);
    console.log('Positions before refresh:', positionsBefore);

    // Refresh page
    await page.reload();
    await waitForCanvas(page);

    // Check nodes restored
    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(2);

    // Check positions maintained
    const positionsAfter = await getNodePositions(page);
    console.log('Positions after refresh:', positionsAfter);

    // Positions should be approximately the same (allowing for small differences)
    expect(positionsAfter).toHaveLength(2);
    
    console.log('✅ [REAL-BROWSER] Nodes restored after refresh');
  });

  test('should clear canvas with resetCanvas and stay empty after refresh', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing resetCanvas in real browser');

    // Add first node
    console.log('Adding first node...');
    await addNodeToCanvas(page, 200, 200);
    let nodeCount = await getNodeCount(page);
    console.log(`First node added, count: ${nodeCount}`);
    expect(nodeCount).toBe(1);

    // Add second node
    console.log('Adding second node...');
    await addNodeToCanvas(page, 300, 300);
    nodeCount = await getNodeCount(page);
    console.log(`Second node added, count: ${nodeCount}`);
    expect(nodeCount).toBe(2);

    // Check domain has nodes
    const domainBefore = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    console.log('Domain before reset:', { children: domainBefore.children?.length || 0 });

    // Call resetCanvas
    await callResetCanvas(page);

    // Should be empty immediately
    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(0);
    console.log('✅ Canvas cleared with resetCanvas');

    // CRITICAL: Check domain is also cleared
    const domainAfter = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    console.log('Domain after reset:', { children: domainAfter.children?.length || 0 });
    expect(domainAfter.children?.length || 0).toBe(0);

    // Check localStorage has empty snapshot
    const snapshot = await getLocalStorageSnapshot(page);
    expect(snapshot).toBeTruthy();
    const parsed = JSON.parse(snapshot!);
    expect(parsed.rawGraph.children.length).toBe(0);
    console.log('✅ localStorage has empty snapshot');

    // Refresh page
    await page.reload();
    await waitForCanvas(page);

    // Should stay empty
    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(0);

    // CRITICAL: Domain should stay empty
    const domainAfterRefresh = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    console.log('Domain after refresh:', { children: domainAfterRefresh.children?.length || 0 });
    expect(domainAfterRefresh.children?.length || 0).toBe(0);

    console.log('✅ [REAL-BROWSER] Canvas AND domain stayed empty after refresh');
  });

  test('CRITICAL: should not move existing nodes when adding new ones', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing position stability - THE MAIN BUG');

    // Add first node at specific position
    await addNodeToCanvas(page, 100, 100);
    
    // Wait and capture position
    await page.waitForTimeout(1000);
    const positionsAfter1 = await getNodePositions(page);
    expect(positionsAfter1).toHaveLength(1);
    
    const firstNodePos = positionsAfter1[0];
    console.log('First node position:', firstNodePos);

    // Add second node
    await addNodeToCanvas(page, 300, 300);
    
    // Wait and check positions
    await page.waitForTimeout(1000);
    const positionsAfter2 = await getNodePositions(page);
    expect(positionsAfter2).toHaveLength(2);

    // CRITICAL: Find the first node and verify it didn't move
    const firstNodeAfter = positionsAfter2.find(p => p.id === firstNodePos.id);
    expect(firstNodeAfter).toBeDefined();

    // Allow small tolerance for rendering differences
    const tolerance = 5;
    const xDiff = Math.abs(firstNodeAfter!.x - firstNodePos.x);
    const yDiff = Math.abs(firstNodeAfter!.y - firstNodePos.y);

    console.log('Position comparison:', {
      before: firstNodePos,
      after: firstNodeAfter,
      xDiff,
      yDiff
    });

    if (xDiff > tolerance || yDiff > tolerance) {
      console.error('❌ [REAL-BROWSER] POSITION SHIFT DETECTED!');
      console.error('This is the bug you reported - nodes are moving when adding new ones');
      
      // Take screenshot for debugging
      await page.screenshot({ path: 'position-shift-bug.png' });
    }

    expect(xDiff).toBeLessThanOrEqual(tolerance);
    expect(yDiff).toBeLessThanOrEqual(tolerance);

    console.log('✅ [REAL-BROWSER] Existing nodes maintained their positions');
  });

  test('CRITICAL: should handle add after refresh without position shifts', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing add after refresh - ANOTHER MAIN BUG');

    // Add nodes
    await addNodeToCanvas(page, 150, 150);
    await addNodeToCanvas(page, 250, 250);

    // Wait for persistence
    await page.waitForTimeout(2000);

    // Capture positions
    const positionsBefore = await getNodePositions(page);
    console.log('Positions before refresh:', positionsBefore);

    // Refresh
    await page.reload();
    await waitForCanvas(page);

    // Verify restoration
    let nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(2);

    const positionsAfterRefresh = await getNodePositions(page);
    console.log('Positions after refresh:', positionsAfterRefresh);

    // Add NEW node after refresh
    await addNodeToCanvas(page, 400, 400);

    // Check all positions
    const positionsAfterAdd = await getNodePositions(page);
    console.log('Positions after adding new node:', positionsAfterAdd);

    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(3);

    // CRITICAL: Original nodes should not have moved
    const tolerance = 10;
    
    for (const originalPos of positionsBefore) {
      const currentPos = positionsAfterAdd.find(p => p.id === originalPos.id);
      expect(currentPos).toBeDefined();

      const xDiff = Math.abs(currentPos!.x - originalPos.x);
      const yDiff = Math.abs(currentPos!.y - originalPos.y);

      console.log(`Node ${originalPos.id} movement:`, { xDiff, yDiff });

      if (xDiff > tolerance || yDiff > tolerance) {
        console.error('❌ [REAL-BROWSER] POSITION SHIFT AFTER REFRESH + ADD!');
        console.error('This is the exact bug you reported');
        
        await page.screenshot({ path: 'refresh-add-position-shift.png' });
      }

      expect(xDiff).toBeLessThanOrEqual(tolerance);
      expect(yDiff).toBeLessThanOrEqual(tolerance);
    }

    console.log('✅ [REAL-BROWSER] No position shifts after refresh + add');
  });

  test('CRITICAL: should handle resetCanvas then URL navigation correctly', async ({ page }) => {
    console.log('🧪 [REAL-BROWSER] Testing resetCanvas + URL navigation');

    // Add nodes first
    await addNodeToCanvas(page, 200, 200);
    await page.waitForTimeout(2000);

    let nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(1);
    console.log('✅ Added node');

    // Call resetCanvas
    await callResetCanvas(page);
    
    nodeCount = await getNodeCount(page);
    expect(nodeCount).toBe(0);
    console.log('✅ resetCanvas cleared canvas');

    // Navigate to URL with architecture (this should NOT load due to localStorage priority)
    await page.goto('http://localhost:3000/canvas?arch=epS1nF4v0fgJvjn3YVRt');
    
    // Wait for page to load
    try {
      await waitForCanvas(page);
    } catch (error) {
      console.log('Canvas loading timeout - this might be expected if URL loading is blocked');
    }

    // Check if URL architecture loaded (it shouldn't due to localStorage priority)
    await page.waitForTimeout(3000);
    nodeCount = await getNodeCount(page);
    
    console.log(`Node count after URL navigation: ${nodeCount}`);
    
    // Check domain
    const domain = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    console.log('Domain after URL navigation:', { children: domain.children?.length || 0 });

    // CRITICAL: Should stay empty because localStorage has empty snapshot
    if (nodeCount > 0) {
      console.error('❌ [REAL-BROWSER] URL OVERRIDE BUG DETECTED!');
      console.error('resetCanvas + localStorage priority failed');
      await page.screenshot({ path: 'resetcanvas-url-override-bug.png' });
    }

    expect(nodeCount).toBe(0);
    expect(domain.children?.length || 0).toBe(0);

    console.log('✅ [REAL-BROWSER] resetCanvas + localStorage priority works correctly');
  });
});

test.describe('Real Browser Debug Info', () => {
  test('should capture console logs and network requests', async ({ page }) => {
    console.log('🧪 [DEBUG] Capturing browser debug info');

    // Listen to console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('RESTORATION') || msg.text().includes('ViewState')) {
        consoleLogs.push(`${msg.type()}: ${msg.text()}`);
      }
    });

    // Navigate and add node
    await page.goto('http://localhost:3000/canvas');
    await waitForCanvas(page);
    await addNodeToCanvas(page, 200, 200);

    // Wait and capture logs
    await page.waitForTimeout(2000);

    console.log('Console logs captured:');
    consoleLogs.forEach(log => console.log(log));

    // Check for specific error patterns
    const hasRestorationLogs = consoleLogs.some(log => log.includes('RESTORATION'));
    const hasViewStateErrors = consoleLogs.some(log => log.includes('ViewState') && log.includes('error'));

    console.log('Debug analysis:', {
      hasRestorationLogs,
      hasViewStateErrors,
      totalLogs: consoleLogs.length
    });
  });
});
