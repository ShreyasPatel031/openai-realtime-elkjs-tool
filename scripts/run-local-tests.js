#!/usr/bin/env node

/**
 * Orchestrates the local test suite:
 * 1. Builds the project (same as `npm run test:build`)
 * 2. Starts the mock test server (serves dist/ with deterministic APIs)
 * 3. Runs icon fallback checks
 * 4. Executes the Playwright local specs against the mock server
 * 5. Shuts down the mock server
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ensureFirebaseDefaults = () => {
  const defaults = {
    VITE_FIREBASE_API_KEY: 'test-firebase-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test-firebase-auth-domain',
    VITE_FIREBASE_PROJECT_ID: 'test-firebase-project',
    VITE_FIREBASE_STORAGE_BUCKET: 'test-firebase-storage-bucket',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    VITE_FIREBASE_APP_ID: '1:1234567890:web:testappid',
    VITE_FIREBASE_MEASUREMENT_ID: 'G-TESTMEASURE',
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key] || process.env[key].trim() === '') {
      process.env[key] = value;
    }
  }
};

const SERVER_PORT = Number(process.env.TEST_SERVER_PORT || 3000);
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const HEALTH_ENDPOINT = `${SERVER_URL}/health`;

const PLAYWRIGHT_SPECS = [
  'icon-display-validation.test.ts',
  'chat-to-diagram-flow.test.ts',
  'interactive-canvas-rendering.test.ts',
  'embed-to-canvas-flow.test.ts',
  'embed-to-auth-flow.test.ts',
];

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: options.env ? { ...process.env, ...options.env } : process.env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });

const waitForServer = async (url, timeoutMs = 60000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
};

const startMockServer = () =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['scripts/mock-test-server.js'],
      {
        cwd: rootDir,
        stdio: 'inherit',
        env: { ...process.env, PORT: String(SERVER_PORT) },
      },
    );

    child.on('error', reject);
    resolve(child);
  });

const stopMockServer = (serverProcess) =>
  new Promise((resolve) => {
    if (!serverProcess || serverProcess.killed) {
      return resolve(undefined);
    }
    serverProcess.once('exit', () => resolve(undefined));
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  });

const main = async () => {
  let serverProcess;
  try {
    ensureFirebaseDefaults();
    await runCommand('npm', ['run', 'test:build']);

    serverProcess = await startMockServer();
    await waitForServer(HEALTH_ENDPOINT);

    await runCommand('npx', ['playwright', 'install', 'chromium']);

    const sharedEnv = {
      TEST_SERVER_URL: SERVER_URL,
      PLAYWRIGHT_BASE_URL: SERVER_URL,
    };

    await runCommand('node', ['scripts/test-icon-fallback-local.js'], { env: sharedEnv });

    for (const spec of PLAYWRIGHT_SPECS) {
      await runCommand('npm', ['run', 'test:e2e:local', '--', spec], { env: sharedEnv });
    }
  } finally {
    await stopMockServer(serverProcess);
  }
};

main().catch((error) => {
  console.error('❌ Local test suite failed:', error.message);
  process.exit(1);
});
