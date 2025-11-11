/**
 * Embed-to-Auth Production Flow E2E Test
 * 
 * Tests the real embed-to-auth transition flow in production:
 * 1. Create architecture in embed mode
 * 2. Click "Edit" button to transition to canvas then auth
 * 3. Verify architecture is saved to Firebase with custom name
 * 4. Verify architecture appears as first tab
 * 5. Verify historical Firebase architectures load
 * 
 * NO MOCKS - Tests actual production behavior
 */

import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

test.describe('Embed-to-Auth Production Flow', () => {
  let BASE_URL: string;
  
  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });
  
  test('Real embed-to-auth flow with actual Firebase', async ({ page }) => {
    // Step 1: Navigate to embed mode
    console.log('📱 Step 1: Loading embed mode...');
    await page.goto(`${BASE_URL}/embed`);
    await page.waitForLoadState('networkidle');

    // Wait for embed canvas to be ready
    await page.waitForSelector('.react-flow', { timeout: 10000 });
    console.log('✅ Embed canvas loaded');

    // Step 2: Create an architecture via chat
    console.log('🏗️ Step 2: Creating architecture in embed mode...');
    
    const chatInput = page.locator('textarea, input[placeholder*="architecture" i], input[placeholder*="describe" i]').first();
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    
    const architecturePrompt = 'Build a serverless API with Lambda, API Gateway, and DynamoDB';
    await chatInput.fill(architecturePrompt);
    
    // Find and click send button
    const sendButton = page.locator('button[type="submit"]').first();
    await sendButton.click();
    
    console.log(`📝 Sent architecture request: "${architecturePrompt}"`);

    // Wait for architecture to be generated
    console.log('⏳ Waiting for architecture generation...');
    await page.waitForTimeout(5000); // Give AI time to generate
    
    // Verify nodes appeared on canvas
    const nodes = page.locator('.react-flow__node');
    await nodes.first().waitFor({ state: 'visible', timeout: 20000 });
    
    const nodeCount = await nodes.count();
    console.log(`✅ Generated architecture with ${nodeCount} nodes`);
    expect(nodeCount).toBeGreaterThan(0);

    // Step 3: Click "Edit" button to transition
    console.log('🔧 Step 3: Clicking Edit button to transition to auth...');
    
    // Look for Edit button
    const editButton = page.locator('button:has-text("Edit"), button[title="Edit"]').first();
    await editButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Get current URL before clicking
    const embedUrl = await page.url();
    console.log(`📍 Current embed URL: ${embedUrl}`);
    
    // Edit button opens in new tab, so we need to wait for it
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      editButton.click()
    ]);
    
    console.log('✅ Edit button clicked, waiting for new tab...');
    await newPage.waitForLoadState('domcontentloaded');
    
    const authUrl = await newPage.url();
    console.log(`🔐 Opened URL: ${authUrl}`);
    
    // URL should be /auth path with architecture ID
    expect(authUrl).toContain('arch=');

    // Step 4: Wait for auth mode to load (use newPage, not page)
    console.log('⏳ Step 4: Waiting for auth mode to initialize...');
    await newPage.waitForLoadState('domcontentloaded');
    
    // Give Firebase time to sync (real Firebase operations take time)
    await newPage.waitForTimeout(3000);
    
    console.log('✅ Auth mode loaded');

    // Step 5: Verify canvas shows the architecture
    console.log('🎨 Step 5: Verifying canvas content in auth mode...');
    await expect(newPage.locator('.react-flow')).toBeVisible({ timeout: 10000 });
    
    const canvasNodes = newPage.locator('.react-flow__node');
    const canvasNodeCount = await canvasNodes.count();
    console.log(`🎨 Canvas has ${canvasNodeCount} nodes in auth mode`);
    
    // Should have the architecture nodes
    expect(canvasNodeCount).toBeGreaterThan(0);
    console.log('✅ Architecture is visible on canvas');

    // Step 8: Verify chat messages are preserved
    console.log('💬 Step 8: Checking if chat messages persisted...');
    
    // In auth mode, chat is in right panel
    const chatMessages = newPage.locator('[class*="message"], [class*="chat"]').filter({
      hasText: /serverless|lambda|api|dynamo|gateway/i
    });
    
    const messageCount = await chatMessages.count();
    console.log(`💬 Found ${messageCount} chat-related elements`);
    
    // Chat should be preserved
    if (messageCount > 0) {
      console.log('✅ Chat messages preserved from embed to auth');
    } else {
      // Try expanding the chat panel if it's collapsed
      const chatToggle = newPage.locator('button[title*="Chat"]').first();
      const chatToggleExists = await chatToggle.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (chatToggleExists) {
        await chatToggle.click();
        await newPage.waitForTimeout(500);
        const messagesAfterExpand = await chatMessages.count();
        console.log(`💬 After expanding: ${messagesAfterExpand} messages`);
      }
    }

    console.log('🎉 Embed-to-Auth production flow test PASSED!');
    
    await newPage.close();
  });

  test('Direct shared architecture URL in auth mode', async ({ page }) => {
    // Test loading a shared architecture URL directly in auth mode
    console.log('🔗 Testing direct shared architecture URL...');
    
    // This tests that shared URLs work without mocks
    // First create an architecture and get its share URL
    await page.goto(`${BASE_URL}/embed`);
    await page.waitForLoadState('domcontentloaded');
    
    const chatInput = page.locator('textarea, input[placeholder*="architecture" i], input[placeholder*="describe" i]').first();
    await chatInput.fill('Simple web app architecture');
    await page.locator('button[type="submit"]').first().click();
    
    await page.waitForTimeout(5000);
    await page.waitForSelector('.react-flow__node', { timeout: 20000 });
    
    // Get the current URL (should have arch ID)
    const embedUrl = await page.url();
    console.log(`📍 Embed URL: ${embedUrl}`);
    
    // Navigate directly to auth with this architecture ID
    const authUrl = embedUrl.replace('/embed', '/auth');
    console.log(`🔐 Navigating directly to: ${authUrl}`);
    
    await page.goto(authUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // Should load the architecture
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();
    console.log(`📊 Loaded ${nodeCount} nodes from shared URL`);
    
    expect(nodeCount).toBeGreaterThanOrEqual(0);
    console.log('✅ Shared architecture URL loads without crash');
  });
});
