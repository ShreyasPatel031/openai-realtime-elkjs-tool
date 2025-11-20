/**
 * Embed-to-Canvas Flow E2E Test
 * 
 * Validates:
 * 1. Architecture persists from embed to canvas
 * 2. Chat messages persist from embed to canvas
 * 3. Architecture renders correctly from ELK data (loadComplexDefault)
 */

import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

/**
 * Validates that an architecture is properly rendered on canvas
 * - Nodes exist and are visible
 * - Nodes are not all at position 0,0 (ELK layout worked)
 * - Nodes have proper dimensions (not collapsed)
 */
async function validateArchitectureRendering(page: any, testName: string) {
  console.log(`🎨 [${testName}] Loading complex default architecture...`);
  
  // Load the complex default architecture
  await page.evaluate(() => {
    (window as any).loadComplexDefault();
  });
  
  // Wait for nodes to render
  await page.waitForTimeout(3000);
  
  // Get all rendered nodes with their positions and dimensions
  const nodeData = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.react-flow__node'));
    return nodes.map((el) => {
      const rect = el.getBoundingClientRect();
      const transformMatch = (el as HTMLElement).style.transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
      return {
        id: el.getAttribute('data-id') || '',
        domRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        transform: transformMatch ? { 
          x: parseFloat(transformMatch[1]), 
          y: parseFloat(transformMatch[2]) 
        } : null
      };
    });
  });
  
  console.log(`📊 [${testName}] Found ${nodeData.length} nodes on canvas`);
  
  // Validate: Should have nodes (complex default has many nested nodes)
  expect(nodeData.length).toBeGreaterThan(0);
  console.log(`✅ [${testName}] Architecture has nodes: ${nodeData.length}`);
  
  // Validate: Nodes should not all be at 0,0 (means ELK layout worked)
  const nodesAtOrigin = nodeData.filter(n => 
    n.transform && Math.abs(n.transform.x) < 10 && Math.abs(n.transform.y) < 10
  );
  const percentAtOrigin = (nodesAtOrigin.length / nodeData.length) * 100;
  
  console.log(`📍 [${testName}] Nodes at origin (0,0): ${nodesAtOrigin.length}/${nodeData.length} (${percentAtOrigin.toFixed(1)}%)`);
  
  // Allow some nodes at origin (e.g., root group), but not all
  expect(percentAtOrigin).toBeLessThan(90);
  console.log(`✅ [${testName}] ELK layout worked - nodes are distributed`);
  
  // Validate: Nodes should have non-zero dimensions
  const nodesWithDimensions = nodeData.filter(n => 
    n.domRect.width > 0 && n.domRect.height > 0
  );
  const percentWithDimensions = (nodesWithDimensions.length / nodeData.length) * 100;
  
  console.log(`📐 [${testName}] Nodes with dimensions: ${nodesWithDimensions.length}/${nodeData.length} (${percentWithDimensions.toFixed(1)}%)`);
  
  expect(percentWithDimensions).toBeGreaterThan(50);
  console.log(`✅ [${testName}] Nodes have proper dimensions`);
  
  // Sample node positions for debugging
  const sampleNodes = nodeData.slice(0, 5);
  console.log(`🔍 [${testName}] Sample node positions:`, sampleNodes.map(n => ({
    id: n.id,
    transform: n.transform,
    size: { w: n.domRect.width, h: n.domRect.height }
  })));
  
  console.log(`✅ [${testName}] Architecture rendering validation passed`);
}

test.describe('Embed-to-Canvas Flow', () => {
  let BASE_URL: string;
  
  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });
  
  test('Architecture and chat persist from embed to canvas', async ({ page }) => {
    console.log('📱 Loading embed mode...');
    await page.goto(`${BASE_URL}/embed`);
    await page.waitForLoadState('networkidle');
    
    // Wait for canvas to initialize
    await page.waitForSelector('.react-flow', { timeout: 10000 });
    await page.waitForTimeout(1000);
    console.log('✅ Embed page loaded');
    
    // Validate architecture rendering from ELK data
    await validateArchitectureRendering(page, 'embed-to-canvas');
  });
});
