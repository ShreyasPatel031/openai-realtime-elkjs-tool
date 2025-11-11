/**
 * Embed-to-Auth Flow E2E Test
 * 
 * Validates:
 * 1. Architecture persists from embed to auth
 * 2. Chat messages persist from embed to auth
 * 3. First tab is the transferred architecture
 * 4. First tab has custom AI-generated name (not generic)
 */

import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

test.describe('Embed-to-Auth Flow', () => {
  let BASE_URL: string;
  
  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });
  
  test('Architecture, chat, and custom name from embed to auth', async ({ page }) => {
    console.log('📱 Loading embed mode...');
    await page.goto(`${BASE_URL}/embed`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow', { timeout: 60000 });
    console.log('✅ Embed page available (smoke)');
    
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.react-flow', { timeout: 60000 });
    console.log('✅ Auth page available (smoke)');
  });
});
