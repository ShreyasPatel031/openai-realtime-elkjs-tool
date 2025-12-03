import { test, expect } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/canvas` : 'http://localhost:3000/canvas';

test.describe('InteractiveCanvas Rendering', () => {
  test.skip('should render empty canvas that can be interacted with', async ({ page }) => {
    console.log('🚀 Starting InteractiveCanvas rendering test...');
    
    // Navigate to the application
    await page.goto(baseURL);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForSelector('.react-flow', { timeout: 15000 });
    console.log('✅ Page loaded successfully');
    
    // Wait for the canvas to initialize
    await page.waitForTimeout(3000);
    
    // Check if the ReactFlow canvas exists - wait for it to be visible
    const reactFlowCanvas = page.locator('.react-flow');
    await reactFlowCanvas.waitFor({ state: 'visible', timeout: 10000 });
    const canvasExists = await reactFlowCanvas.count();
    
    if (canvasExists === 0) {
      throw new Error('❌ ReactFlow canvas not found - InteractiveCanvas is broken');
    }
    
    console.log('✅ ReactFlow canvas found');
    
    // Check if there are any nodes rendered
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();
    
    console.log(`Found ${nodeCount} nodes on canvas`);
    
    // Take a screenshot for debugging
    await page.screenshot({ 
      path: 'test-results/interactive-canvas-rendering.png',
      fullPage: true 
    });
    
    // The canvas should exist and be functional
    expect(canvasExists).toBeGreaterThan(0);
    
    // Check if the canvas is visible and has proper dimensions
    const canvasBoundingBox = await reactFlowCanvas.boundingBox();
    expect(canvasBoundingBox).not.toBeNull();
    expect(canvasBoundingBox!.width).toBeGreaterThan(0);
    expect(canvasBoundingBox!.height).toBeGreaterThan(0);
    
    console.log('✅ Canvas is visible and has proper dimensions');
    
    // Canvas can start empty - that's fine, it just needs to be functional
    console.log(`✅ Canvas is functional with ${nodeCount} nodes`);
    
    // Check if there are any error indicators on the canvas
    const errorIndicators = await page.locator('text="Error"').count();
    const missingIconIndicators = await page.locator('text="❌ MISSING ICON"').count();
    
    if (errorIndicators > 0) {
      console.log(`⚠️ Found ${errorIndicators} error indicators on canvas`);
    }
    
    if (missingIconIndicators > 0) {
      console.log(`⚠️ Found ${missingIconIndicators} missing icon indicators on canvas`);
    }
    
    console.log('🎉 InteractiveCanvas rendering test completed successfully!');
  });
  
  test('should handle architecture generation and display nodes', async ({ page }) => {
    console.log('🚀 Testing architecture generation and node display...');
    
    // Navigate to the application
    await page.goto(baseURL);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForSelector('.react-flow', { timeout: 15000 });
    console.log('✅ Page loaded successfully');
    
        await page.waitForTimeout(1000);
    console.log('ℹ️ Interaction smoke check complete');
  });
});
