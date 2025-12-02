import { test, expect } from '@playwright/test';

test.describe('Real Persistence Test', () => {
  const baseURL = 'http://localhost:3000';

  test('should persist nodes after refresh - REAL TEST', async ({ page }) => {
    // Navigate to app
    await page.goto(`${baseURL}/canvas`);
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    try {
      await page.waitForSelector('.react-flow__pane', { timeout: 10000 });
    } catch (e) {
      await page.waitForSelector('.react-flow', { timeout: 10000 });
    }

    // Add a node
    await page.click('[title*="box" i]'); // Select box tool
    await page.click('.react-flow', { position: { x: 300, y: 300 } }); // Click canvas
    
    // Wait for node to be processed
    await page.waitForTimeout(2000);
    
    // Check if node exists in domain
    const domainBefore = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    
    console.log('Domain before refresh:', domainBefore);
    
    if (domainBefore.children?.length === 0) {
      throw new Error('PERSISTENCE BROKEN: Node not added to domain');
    }

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    try {
      await page.waitForSelector('.react-flow__pane', { timeout: 10000 });
    } catch (e) {
      await page.waitForSelector('.react-flow', { timeout: 10000 });
    }
    await page.waitForTimeout(2000);

    // Check if node persists
    const domainAfter = await page.evaluate(() => {
      return (window as any).getDomainGraph?.() || { children: [] };
    });
    
    const canvasNodes = await page.locator('.react-flow__node').count();
    
    console.log('Domain after refresh:', domainAfter);
    console.log('Canvas nodes after refresh:', canvasNodes);
    
    if (domainAfter.children?.length === 0) {
      throw new Error('PERSISTENCE BROKEN: Node disappeared after refresh');
    }
    
    if (canvasNodes === 0) {
      throw new Error('PERSISTENCE BROKEN: Node not visible on canvas after refresh');
    }

    expect(domainAfter.children.length).toBeGreaterThan(0);
    expect(canvasNodes).toBeGreaterThan(0);
  });
});
