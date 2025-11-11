import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

test.describe('Chat Persistence Snapshot', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });

  test('embed chat survives navigation to canvas', async ({ page, context }) => {
    const prompt = 'Minimal persistence check prompt';

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[StepEdge]') || text.includes('🔍 COLLISION')) return;
      console.log('🟦 EMBED console:', text);
    });

    await page.goto(`${BASE_URL}/embed`);
    await page.waitForLoadState('networkidle');

    const broadcastSupportedEmbed = await page.evaluate(() => typeof BroadcastChannel !== 'undefined');
    console.log('📡 Broadcast supported (embed):', broadcastSupportedEmbed);

    const chatInput = page.locator('input[placeholder*="architecture" i], input[placeholder*="describe" i]').first();
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatInput.fill(prompt);
    await chatInput.press('Enter');

    await page.waitForFunction(() => {
      const stored = localStorage.getItem('atelier_current_conversation');
      if (!stored) return false;
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) && parsed.some((msg: any) => (msg?.content || '').trim().length > 0);
      } catch {
        return false;
      }
    }, undefined, { timeout: 10000 });

    const editButton = page.locator('button:has-text("Edit")').first();
    const popupPromise = context.waitForEvent('page');
    await editButton.click();

    const embedSnapshot = await page.evaluate(() => ({
      storageValue: localStorage.getItem('embed_pending_chat'),
      windowValue: (window as any).__embedChatSnapshot ?? null,
      conversation: localStorage.getItem('atelier_current_conversation'),
      promptGlobal: (window as any).originalChatTextInput ?? null,
      targetUrl: (window as any).__targetUrlForEdit ?? null,
    }));
    console.log('🗂️ Embed pending chat snapshot:', embedSnapshot);

    const canvasPage = await popupPromise;

    canvasPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[StepEdge]') || text.includes('🔍 COLLISION')) return;
      console.log('🟥 CANVAS console:', text);
    });

    await canvasPage.waitForLoadState('domcontentloaded');

    const hasOpener = await canvasPage.evaluate(() => {
      try {
        return !!window.opener && window.opener !== window;
      } catch {
        return false;
      }
    });
    console.log('🔗 Canvas has opener window:', hasOpener);

    const broadcastSupportedCanvas = await canvasPage.evaluate(() => typeof BroadcastChannel !== 'undefined');
    console.log('📡 Broadcast supported (canvas):', broadcastSupportedCanvas);

    const windowName = await canvasPage.evaluate(() => window.name);
    console.log('🪟 Canvas window.name:', windowName);

    const openerConversation = await canvasPage.evaluate(() => {
      try {
        if (window.opener && window.opener !== window) {
          return {
            conversation: window.opener.localStorage?.getItem('atelier_current_conversation') ?? null,
            lastConversation: (window.opener as any).__atelierLastConversation ?? null,
          };
        }
      } catch {}
      return { conversation: null, lastConversation: null };
    });
    console.log('📦 Conversation seen from opener:', openerConversation);

    console.log('🌐 Canvas URL:', await canvasPage.url());

    await canvasPage.waitForFunction((expectedPrompt) => {
      const stored = localStorage.getItem('atelier_current_conversation');
      if (!stored) return false;
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) && parsed.some((msg: any) => (msg?.content || '').trim() === String(expectedPrompt).trim());
      } catch {
        return false;
      }
    }, prompt, { timeout: 5000 });

    const canvasChatSnapshot = await canvasPage.evaluate(() => localStorage.getItem('atelier_current_conversation'));
    expect(canvasChatSnapshot, 'canvas should keep embed conversation').toBeTruthy();

    const parsed = canvasChatSnapshot ? JSON.parse(canvasChatSnapshot) : [];
    const match = Array.isArray(parsed) && parsed.some((msg: any) => msg?.content?.trim() === prompt.trim());
    expect(match, 'canvas conversation should include original prompt').toBe(true);
  });
});

