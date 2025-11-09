/**
 * Embed-to-Canvas Flow E2E Test
 * 
 * Validates:
 * 1. Architecture persists from embed to canvas
 * 2. Chat messages persist from embed to canvas
 */

import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

test.describe('Embed-to-Canvas Flow', () => {
  let BASE_URL: string;
  
  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });
  
  test.skip('Architecture and chat persist from embed to canvas', async ({ page, context }) => {
    console.log('📱 Loading embed mode...');
    await page.goto(`${BASE_URL}/embed`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.react-flow', { timeout: 10000 });

    console.log('🏗️ Creating architecture...');
    const prompt = 'Build API with Lambda and DynamoDB';
    console.log(`📝 Test prompt: "${prompt}"`);
    
    // Chatbox uses Input component (input element, not textarea)
    const chatInput = page.locator('input[placeholder*="architecture" i], input[placeholder*="describe" i]').first();
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatInput.fill(prompt);
    // Submit via form API to avoid pointer interception issues on the submit button
    await chatInput.evaluate((input) => {
      if (input instanceof HTMLInputElement) {
        input.form?.requestSubmit();
      }
    });
    await page.waitForFunction(() => {
      const stored = localStorage.getItem('atelier_current_conversation');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return true;
          }
        } catch {
          // ignore parse errors
        }
      }
      return false;
    }, undefined, { timeout: 15000 });

    const embedFallbackKeys = await page.evaluate(() => {
      const sessionKeys = typeof sessionStorage !== 'undefined'
        ? Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter(Boolean)
        : [];
      const localKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(Boolean);
      return {
        sessionKeys: sessionKeys.filter((key) => key?.startsWith('embed_pending_arch_')),
        localKeys: localKeys.filter((key) => key?.startsWith('embed_pending_arch_')),
      };
    });
    console.log('🗂️ Embed fallback keys:', embedFallbackKeys);

    await page.waitForTimeout(5000);
    const nodes = page.locator('.react-flow__node:visible');
    await nodes.first().waitFor({ state: 'visible', timeout: 45000 });
    
    const embedNodeCount = await nodes.count();
    console.log(`✅ Embed: ${embedNodeCount} nodes`);
    expect(embedNodeCount).toBeGreaterThan(0);

    console.log('🔧 Clicking Edit (this will save architecture and open canvas)...');
    const editButton = page.locator('button:has-text("Edit")').first();
    
    const [canvasPage] = await Promise.all([
      context.waitForEvent('page'),
      editButton.click()
    ]);

    const embedFallbackAfterClick = await page.evaluate(() => {
      const storageKeyPrefix = 'embed_pending_arch_';
      const sessionKeys = typeof sessionStorage !== 'undefined'
        ? Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter((key): key is string => !!key && key.startsWith(storageKeyPrefix))
        : [];
      const localKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((key): key is string => !!key && key.startsWith(storageKeyPrefix));
      return { sessionKeys, localKeys };
    }).catch(() => ({ sessionKeys: [], localKeys: [] }));
    console.log('🗂️ Embed fallback keys after click:', embedFallbackAfterClick);
    
    // Wait for page to load
    await canvasPage.waitForLoadState('load');
    await canvasPage.waitForTimeout(2000);
    
    const canvasUrl = await canvasPage.url();
    console.log(`🎨 Canvas URL: ${canvasUrl}`);
    
    // The Edit button should have saved the architecture and included arch= in URL
    expect(canvasUrl).toContain('arch=');
    // Root path (/) is correct - it auto-detects auth state

    console.log('📊 Verifying architecture...');
    const canvasNodes = canvasPage.locator('.react-flow__node:visible');
    await canvasNodes.first().waitFor({ state: 'visible', timeout: 20000 });
    
    const canvasNodeCount = await canvasNodes.count();
    console.log(`✅ Canvas: ${canvasNodeCount} nodes`);
    // Node count should be similar (allow +/- 1 for layout variations)
    expect(canvasNodeCount).toBeGreaterThanOrEqual(embedNodeCount - 1);
    expect(canvasNodeCount).toBeLessThanOrEqual(embedNodeCount + 1);

    console.log('💬 Checking chat persistence...');
    // Verify chat messages were persisted by checking localStorage
    // Allow persistence to complete since canvas boot can hydrate asynchronously
    let chatPersistence = await canvasPage.evaluate((expectedPrompt) => {
      const normalizedPrompt = String(expectedPrompt ?? '').trim();
      const directStored = localStorage.getItem('atelier_current_conversation');
      let directMessages: any[] = [];
      if (directStored) {
        try {
          const parsed = JSON.parse(directStored);
          if (Array.isArray(parsed)) {
            directMessages = parsed;
          }
        } catch {
          directMessages = [];
        }
      }

      const fallbackEntries: Array<{ key: string; messages: any[] }> = [];
      const storageSources: Array<{ type: 'local' | 'session'; store: Storage }> = [
        { type: 'local', store: localStorage },
        { type: 'session', store: sessionStorage },
      ];
      for (const { type, store } of storageSources) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (!key || !key.startsWith('embed_pending_arch_')) continue;
          const raw = store.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.chatMessages && Array.isArray(parsed.chatMessages)) {
              fallbackEntries.push({ key: `${type}:${key}`, messages: parsed.chatMessages });
            }
          } catch {
            // ignore parse issues
          }
        }
      }

      const messageMatchesPrompt = (messages: any[]) =>
        messages.some((msg: any) => (msg?.content || '').trim() === normalizedPrompt);

      return {
        directCount: directMessages.length,
        directMatches: messageMatchesPrompt(directMessages),
        directMessages: directMessages.map(msg => ({
          content: msg?.content ?? '',
          sender: msg?.sender ?? 'user',
        })),
        fallbackEntries: fallbackEntries.map(entry => ({
          key: entry.key,
          count: entry.messages.length,
          matches: messageMatchesPrompt(entry.messages),
          messages: entry.messages.map((msg: any) => ({
            content: msg?.content ?? '',
            sender: msg?.sender ?? 'user',
          })),
        })),
      };
    }, prompt);

    const deadline = Date.now() + 30000;
    while (!(chatPersistence.directMatches || chatPersistence.fallbackEntries.some(entry => entry.matches)) && Date.now() < deadline) {
      await canvasPage.waitForTimeout(1000);
      chatPersistence = await canvasPage.evaluate((expectedPrompt) => {
        const normalizedPrompt = String(expectedPrompt ?? '').trim();
        const directStored = localStorage.getItem('atelier_current_conversation');
        let directMessages: any[] = [];
        if (directStored) {
          try {
            const parsed = JSON.parse(directStored);
            if (Array.isArray(parsed)) {
              directMessages = parsed;
            }
          } catch {
            directMessages = [];
          }
        }

        const fallbackEntries: Array<{ key: string; messages: any[] }> = [];
        const storageSources: Array<{ type: 'local' | 'session'; store: Storage }> = [
          { type: 'local', store: localStorage },
          { type: 'session', store: sessionStorage },
        ];
        for (const { type, store } of storageSources) {
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key || !key.startsWith('embed_pending_arch_')) continue;
            const raw = store.getItem(key);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.chatMessages && Array.isArray(parsed.chatMessages)) {
                fallbackEntries.push({ key: `${type}:${key}`, messages: parsed.chatMessages });
              }
            } catch {
              // ignore parse issues
            }
          }
        }

        const messageMatchesPrompt = (messages: any[]) =>
          messages.some((msg: any) => (msg?.content || '').trim() === normalizedPrompt);

        return {
          directCount: directMessages.length,
          directMatches: messageMatchesPrompt(directMessages),
          directMessages: directMessages.map(msg => ({
            content: msg?.content ?? '',
            sender: msg?.sender ?? 'user',
          })),
          fallbackEntries: fallbackEntries.map(entry => ({
            key: entry.key,
            count: entry.messages.length,
            matches: messageMatchesPrompt(entry.messages),
            messages: entry.messages.map((msg: any) => ({
              content: msg?.content ?? '',
              sender: msg?.sender ?? 'user',
            })),
          })),
        };
      }, prompt);
    }

    const matchedDirect = chatPersistence.directMatches;
    const matchedFallback = chatPersistence.fallbackEntries.some(entry => entry.matches);
    console.log('📝 Chat persistence debug:', chatPersistence);

    expect(matchedDirect || matchedFallback).toBe(true);

    const persistedMessages = matchedDirect
      ? chatPersistence.directMessages
      : chatPersistence.fallbackEntries.find(entry => entry.matches)?.messages ?? [];
    
    console.log(`📝 Found ${persistedMessages.length} chat messages in canvas`);
    expect(persistedMessages.length).toBeGreaterThan(0);
    
    // CRITICAL: Verify the EXACT prompt from embed is in canvas chat
    const exactPromptMatch = persistedMessages.some((msg: any) =>
      msg.content && msg.content.trim() === prompt.trim()
    );
    
    if (!exactPromptMatch) {
      console.error('❌ Expected chat message:', prompt);
      console.error('❌ Actual chat messages:', chatMessages.map((m: any) => m.content));
    }
    
    expect(exactPromptMatch).toBe(true);
    console.log(`✅ Chat messages persisted correctly - found exact prompt: "${prompt}"`);

    console.log('🎉 Embed-to-Canvas PASSED!');
    await canvasPage.close();
  });
});
