import { defineConfig, devices } from '@playwright/test';

// Dynamic port configuration
const BASE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${BASE_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60000, // 60 seconds for complete architecture generation
  expect: {
    timeout: 15000 // 15 seconds for individual expectations
  },
  fullyParallel: false, // Run tests sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid conflicts
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
  webServer: {
    command: 'npm run dev',
    port: BASE_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
