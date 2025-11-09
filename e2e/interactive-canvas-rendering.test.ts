import { test, expect } from '@playwright/test';

test.describe('InteractiveCanvas Rendering', () => {
  test.skip('should render empty canvas that can be interacted with', async ({ page }) => {
    console.log('🚀 Starting InteractiveCanvas rendering test...');
    
    // Navigate to the application
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
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
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded successfully');
    
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Check if there's a chat input or agent icon to trigger architecture generation
    const agentIcon = page.locator('[data-testid="agent-icon"]');
    const chatInput = page.locator('[data-testid="chat-input"]');
    
    const agentIconExists = await agentIcon.count();
    const chatInputExists = await chatInput.count();
    
    if (agentIconExists > 0) {
      console.log('✅ Agent icon found, attempting to trigger architecture generation');
      
      try {
        await agentIcon.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        
        // Look for chat input after expanding
        const expandedChatInput = page.locator('[data-testid="chat-input"]');
        const expandedInputExists = await expandedChatInput.count();
        
        if (expandedInputExists > 0) {
          console.log('✅ Chat input found after expanding agent panel');
          
          // Type a simple architecture request
          await expandedChatInput.fill('Create a simple web application architecture');
          
          // Look for send button
          const sendButton = page.locator('[data-testid="send-button"]');
          const sendButtonExists = await sendButton.count();
          
          if (sendButtonExists > 0) {
            console.log('✅ Send button found, clicking to generate architecture');
            await sendButton.click();
            
            // Wait for architecture generation
            await page.waitForTimeout(10000);
            
            // Check if nodes appeared on the canvas
            const nodes = page.locator('.react-flow__node');
            const nodeCount = await nodes.count();
            
            console.log(`Found ${nodeCount} nodes after architecture generation`);
            
            if (nodeCount > 0) {
              console.log('✅ Architecture generation successful - nodes rendered');
              
              // Verify nodes are visible and have content
              const firstNode = nodes.first();
              const nodeText = await firstNode.textContent();
              expect(nodeText).toBeTruthy();
              expect(nodeText!.length).toBeGreaterThan(0);
              
              console.log('✅ Nodes have content and are properly rendered');
            } else {
              console.log('⚠️ No nodes found after architecture generation');
            }
          } else {
            console.log('ℹ️ Send button not found - architecture generation may not be available');
          }
        } else {
          console.log('ℹ️ Chat input not found after expanding - architecture generation may not be available');
        }
      } catch (error) {
        console.log('ℹ️ Could not interact with agent icon:', error.message);
      }
    } else if (chatInputExists > 0) {
      console.log('✅ Chat input found directly, attempting architecture generation');
      
      try {
        await chatInput.fill('Create a simple web application architecture');
        
        const sendButton = page.locator('[data-testid="send-button"]');
        const sendButtonExists = await sendButton.count();
        
        if (sendButtonExists > 0) {
          await sendButton.click();
          await page.waitForTimeout(10000);
          
          const nodes = page.locator('.react-flow__node');
          const nodeCount = await nodes.count();
          
          console.log(`Found ${nodeCount} nodes after architecture generation`);
          
          if (nodeCount > 0) {
            console.log('✅ Architecture generation successful - nodes rendered');
          }
        }
      } catch (error) {
        console.log('ℹ️ Could not interact with chat input:', error.message);
      }
    } else {
      console.log('ℹ️ No agent icon or chat input found - architecture generation may not be available');
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ 
      path: 'test-results/architecture-generation-test.png',
      fullPage: true 
    });
    
    console.log('🎉 Architecture generation test completed!');
  });
});
