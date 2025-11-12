#!/usr/bin/env node

/**
 * Lightweight guard to avoid re-running the heavy embeddable build
 * every time `npm run dev` starts. The build only runs when:
 *   • The compiled UMD bundle does not exist, OR
 *   • FORCE_EMBED_BUILD=1 (or --force flag) is provided
 *
 * Developers can manually rebuild via `npm run build:embeddable`
 * or by starting dev with `FORCE_EMBED_BUILD=1 npm run dev`.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const EMBEDDABLE_BUNDLE = resolve(projectRoot, 'dist/embeddable/architecture-generator.umd.js');
const forceFlag = process.env.FORCE_EMBED_BUILD === '1' || process.argv.includes('--force');

if (!forceFlag && existsSync(EMBEDDABLE_BUNDLE)) {
  console.log('ℹ️  Embeddable bundle already present. Skipping rebuild. (set FORCE_EMBED_BUILD=1 to force)');
  process.exit(0);
}

console.log('⚙️  Building embeddable bundle (vite.embeddable.config.ts)...');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build:embeddable'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error('❌ Failed to build embeddable bundle. See output above for details.');
  process.exit(result.status ?? 1);
}

console.log('✅ Embeddable bundle build complete.');


