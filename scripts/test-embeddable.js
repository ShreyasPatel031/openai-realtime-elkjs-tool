#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🧪 Testing Embeddable Component\n');

// Step 1: Build the embeddable component
console.log('📦 Building embeddable component...');
try {
    execSync('npm run build:embeddable', { 
        stdio: 'inherit', 
        cwd: rootDir 
    });
    console.log('✅ Build completed!\n');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}

// Step 2: Check if files exist
const embeddableDir = join(rootDir, 'dist/embeddable');
const jsFile = join(embeddableDir, 'architecture-generator.es.js');
const cssFile = join(embeddableDir, 'style.css');

if (!existsSync(jsFile)) {
    console.error('❌ JS file not found:', jsFile);
    process.exit(1);
}

if (!existsSync(cssFile)) {
    console.error('❌ CSS file not found:', cssFile);
    process.exit(1);
}

console.log('✅ Embeddable files exist:');
console.log(`   📄 JS:  ${jsFile}`);
console.log(`   🎨 CSS: ${cssFile}\n`);

// Step 3: Start test server
console.log('🚀 Starting test server...');
console.log('📍 Open in browser:');
console.log('   🔗 Production test: http://localhost:8080/test-embeddable.html');
console.log('   🔗 Dev test: http://localhost:5173/test-embeddable-vite.html');
console.log('\n💡 Press Ctrl+C to stop the server\n');

try {
    // Try to start Python server
    execSync('python3 -m http.server 8080', { 
        stdio: 'inherit', 
        cwd: rootDir 
    });
} catch (error) {
    console.log('🔄 Python server failed, trying Node.js server...');
    try {
        execSync('npx serve -s . -p 8080', { 
            stdio: 'inherit', 
            cwd: rootDir 
        });
    } catch (nodeError) {
        console.error('❌ Could not start server:', nodeError.message);
        console.log('\n💡 Manual testing:');
        console.log('   1. Run: python3 -m http.server 8080');
        console.log('   2. Open: http://localhost:8080/test-embeddable.html');
        process.exit(1);
    }
} 