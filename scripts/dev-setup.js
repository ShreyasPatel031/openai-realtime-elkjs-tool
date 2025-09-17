#!/usr/bin/env node
/**
 * Multi-View Development Setup
 * Allows independent development of Framer, Canvas, and Signed-in views
 */

import { spawn } from 'child_process';
import chalk from 'chalk';

const DEV_MODES = {
  framer: {
    name: 'Framer Embedded View',
    path: '/embed',
    description: 'Development server for Framer embeddable component',
    component: 'FramerEmbeddable',
    features: ['Embedded mode', 'Limited UI', 'Share to main app']
  },
  canvas: {
    name: 'Canvas View (Anonymous)',
    path: '/canvas', 
    description: 'Canvas mode without authentication',
    component: 'InteractiveCanvas (isPublicMode=true)',
    features: ['Full canvas', 'No authentication', 'Anonymous architectures']
  },
  authenticated: {
    name: 'Signed-in View',
    path: '/auth',
    description: 'Full authenticated experience',
    component: 'InteractiveCanvas (with Firebase auth)',
    features: ['Full authentication', 'Save/load', 'Architecture management', 'Sidebar']
  }
};

function printHelp() {
  console.log(chalk.blue.bold('\n🎨 Multi-View Development Setup\n'));
  console.log(chalk.yellow('Available development views (all on same server):\n'));
  
  Object.entries(DEV_MODES).forEach(([key, mode]) => {
    console.log(chalk.green.bold(`📱 ${key.toUpperCase()}: ${mode.name}`));
    console.log(chalk.gray(`   Description: ${mode.description}`));
    console.log(chalk.cyan(`   Path: ${mode.path}`));
    console.log(chalk.gray(`   Component: ${mode.component}`));
    console.log(chalk.gray(`   Features: ${mode.features.join(', ')}`));
    console.log('');
  });
  
  console.log(chalk.yellow('Usage:'));
  console.log(chalk.white('  npm run dev             # Start development server'));
  console.log(chalk.white('  npm run dev:help        # Show this help'));
  console.log('');
  console.log(chalk.yellow('Once server is running, visit:'));
  Object.entries(DEV_MODES).forEach(([key, mode]) => {
    console.log(chalk.cyan(`  http://localhost:[PORT]${mode.path}   # ${mode.name}`));
  });
  console.log('');
}

function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  
  // For any command, just show the help since we're using path-based routing now
  console.log(chalk.blue.bold('🎨 Path-Based Multi-View Development\n'));
  console.log(chalk.green('All views are now available on the same development server!\n'));
  console.log(chalk.yellow('Start the development server with:'));
  console.log(chalk.white('  npm run dev\n'));
  console.log(chalk.yellow('Then visit these paths:'));
  Object.entries(DEV_MODES).forEach(([key, mode]) => {
    console.log(chalk.cyan(`  http://localhost:[PORT]${mode.path}   # ${mode.name}`));
  });
  console.log('');
  console.log(chalk.gray('The port will be shown when you start the server.'));
}

main();
