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
    port: 3000,
    description: 'Development server for Framer embeddable component',
    url: 'http://localhost:3000/embed',
    component: 'FramerEmbeddable',
    features: ['Embedded mode', 'Limited UI', 'Share to main app']
  },
  canvas: {
    name: 'Canvas View (Anonymous)',
    port: 3001, 
    description: 'Canvas mode without authentication',
    url: 'http://localhost:3001',
    component: 'InteractiveCanvas (isPublicMode=true)',
    features: ['Full canvas', 'No authentication', 'Anonymous architectures']
  },
  authenticated: {
    name: 'Signed-in View',
    port: 3002,
    description: 'Full authenticated experience',
    url: 'http://localhost:3002',
    component: 'InteractiveCanvas (with Firebase auth)',
    features: ['Full authentication', 'Save/load', 'Architecture management', 'Sidebar']
  }
};

function printHelp() {
  console.log(chalk.blue.bold('\n🎨 Multi-View Development Setup\n'));
  console.log(chalk.yellow('Available development modes:\n'));
  
  Object.entries(DEV_MODES).forEach(([key, mode]) => {
    console.log(chalk.green.bold(`📱 ${key.toUpperCase()}: ${mode.name}`));
    console.log(chalk.gray(`   Description: ${mode.description}`));
    console.log(chalk.cyan(`   URL: ${mode.url}`));
    console.log(chalk.gray(`   Component: ${mode.component}`));
    console.log(chalk.gray(`   Features: ${mode.features.join(', ')}`));
    console.log('');
  });
  
  console.log(chalk.yellow('Usage:'));
  console.log(chalk.white('  npm run dev:framer      # Start Framer embedded development'));
  console.log(chalk.white('  npm run dev:canvas      # Start Canvas view development'));
  console.log(chalk.white('  npm run dev:auth        # Start authenticated view development'));
  console.log(chalk.white('  npm run dev:all         # Start all three views simultaneously'));
  console.log('');
}

function startDevServer(mode, port) {
  console.log(chalk.blue(`🚀 Starting ${DEV_MODES[mode].name} on port ${port}...`));
  
  const env = {
    ...process.env,
    PORT: port,
    DEV_MODE: mode,
    VITE_DEV_MODE: mode
  };
  
  const server = spawn('vercel', ['dev', '--listen', `0.0.0.0:${port}`], {
    env,
    stdio: 'inherit'
  });
  
  server.on('error', (error) => {
    console.error(chalk.red(`❌ Failed to start ${mode} server:`, error.message));
  });
  
  server.on('close', (code) => {
    if (code !== 0) {
      console.error(chalk.red(`❌ ${mode} server exited with code ${code}`));
    }
  });
  
  return server;
}

function main() {
  const mode = process.argv[2];
  
  if (!mode || mode === 'help' || mode === '--help' || mode === '-h') {
    printHelp();
    return;
  }
  
  switch (mode) {
    case 'framer':
      startDevServer('framer', 3000);
      console.log(chalk.green(`✅ Framer view available at: ${DEV_MODES.framer.url}`));
      break;
      
    case 'canvas':
      startDevServer('canvas', 3001);
      console.log(chalk.green(`✅ Canvas view available at: ${DEV_MODES.canvas.url}`));
      break;
      
    case 'auth':
    case 'authenticated':
      startDevServer('authenticated', 3002);
      console.log(chalk.green(`✅ Authenticated view available at: ${DEV_MODES.authenticated.url}`));
      break;
      
    case 'all':
      console.log(chalk.blue.bold('🚀 Starting all development servers...\n'));
      
      const servers = [
        startDevServer('framer', 3000),
        startDevServer('canvas', 3001), 
        startDevServer('authenticated', 3002)
      ];
      
      console.log(chalk.green.bold('\n✅ All servers started!'));
      console.log(chalk.yellow('\n📱 Development URLs:'));
      Object.entries(DEV_MODES).forEach(([key, mode]) => {
        console.log(chalk.cyan(`   ${mode.name}: ${mode.url}`));
      });
      
      // Handle cleanup
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n🛑 Shutting down all servers...'));
        servers.forEach(server => server.kill());
        process.exit(0);
      });
      break;
      
    default:
      console.error(chalk.red(`❌ Unknown mode: ${mode}`));
      console.log(chalk.yellow('Use "help" to see available modes'));
      process.exit(1);
  }
}

main();
