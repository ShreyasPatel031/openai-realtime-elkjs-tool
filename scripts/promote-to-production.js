#!/usr/bin/env node

/**
 * Production Promotion Script
 * 
 * This script ensures that all tests pass before promoting
 * a Vercel preview deployment to production.
 */

import { execSync } from 'child_process';
import VercelPreviewTester from './test-vercel-preview.js';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (color, message) => console.log(`${color}${message}${COLORS.reset}`);
const success = (message) => log(COLORS.green, `✅ ${message}`);
const error = (message) => log(COLORS.red, `❌ ${message}`);
const info = (message) => log(COLORS.blue, `ℹ️  ${message}`);
const warning = (message) => log(COLORS.yellow, `⚠️  ${message}`);

async function promoteToProduction() {
  console.log(`${COLORS.bold}${COLORS.blue}🚀 Production Promotion Workflow${COLORS.reset}\n`);
  
  try {
    // Step 1: Run comprehensive tests on preview
    info('Step 1: Running comprehensive tests on preview deployment...');
    
    const tester = new VercelPreviewTester();
    const testsPass = await tester.runAllTests();
    
    if (!testsPass) {
      error('Tests failed on preview deployment.');
      error('❌ PROMOTION BLOCKED - Fix failing tests before promoting to production.');
      process.exit(1);
    }
    
    success('All tests passed on preview deployment!');
    
    // Step 2: Confirm promotion
    console.log('\n' + '='.repeat(60));
    console.log(`${COLORS.bold}${COLORS.yellow}⚠️  PRODUCTION PROMOTION CONFIRMATION${COLORS.reset}`);
    console.log('='.repeat(60));
    
    warning('You are about to promote the current preview to production.');
    warning('This will make the changes live on atelier-inc.net');
    
    // In a real scenario, you might want to add interactive confirmation
    // For now, we'll just show the command to run
    console.log(`\n${COLORS.bold}To complete the promotion, run:${COLORS.reset}`);
    console.log(`${COLORS.green}vercel --prod${COLORS.reset}\n`);
    
    console.log(`${COLORS.yellow}Or use the Vercel dashboard to promote the deployment.${COLORS.reset}`);
    
    success('✅ Preview deployment is ready for production promotion!');
    
  } catch (err) {
    error(`Production promotion failed: ${err.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await promoteToProduction();
}
