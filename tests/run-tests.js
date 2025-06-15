#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST RUNNER
 * 
 * This script provides a unified way to run all tests based on real behavior analysis.
 * Tests reflect the actual behavior of the current system after step-by-step flow tracing.
 * Can be used by developers, CI/CD, and downstream agents.
 * 
 * Usage:
 *   node tests/run-tests.js [category]
 *   
 * Categories:
 *   - all (default): Run all tests
 *   - e2e: Run end-to-end flow analysis tests
 *   - integration: Run system integration validation
 *   - quick: Run quick deployment validation
 *   - analysis: Run step-by-step behavior analysis
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

class TestRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    this.testSuites = {
      'e2e': [
        'tests/e2e/step-by-step-tracer.js',
        'tests/e2e/graph-modification-test.js'
      ],
      'integration': [
        'tests/updated-deployment-test.js'
      ],
      'quick': [
        'tests/updated-deployment-test.js'
      ],
      'analysis': [
        'tests/e2e/step-by-step-tracer.js'
      ]
    };
  }

  async run(category = 'all') {
    console.log('🧪 COMPREHENSIVE TEST RUNNER');
    console.log('=' * 60);
    console.log(`📋 Running test category: ${category}`);
    console.log('');

    // Validate environment
    await this.validateEnvironment();

    // Determine which tests to run
    const testsToRun = this.getTestsToRun(category);
    
    if (testsToRun.length === 0) {
      console.error(`❌ No tests found for category: ${category}`);
      process.exit(1);
    }

    console.log(`🎯 Executing ${testsToRun.length} test file(s):`);
    testsToRun.forEach(test => console.log(`   - ${test}`));
    console.log('');

    // Run each test
    for (const testFile of testsToRun) {
      await this.runSingleTest(testFile);
    }

    // Generate final report
    this.generateFinalReport();
    
    // Exit with appropriate code
    process.exit(this.results.failed > 0 ? 1 : 0);
  }

  async validateEnvironment() {
    console.log('🔍 ENVIRONMENT VALIDATION');
    console.log('-' * 40);

    // Check if server might be running
    try {
      const response = await fetch('http://localhost:3000/');
      console.log('✅ Server appears to be running on localhost:3000');
    } catch (error) {
      console.log('⚠️  Server not detected on localhost:3000');
      console.log('   Please ensure the server is running: npm run dev');
    }

    // Check for OPENAI_API_KEY
    if (process.env.OPENAI_API_KEY) {
      console.log('✅ OPENAI_API_KEY environment variable is set');
    } else {
      console.log('⚠️  OPENAI_API_KEY environment variable not set');
      console.log('   Some tests may fail without this');
    }

    // Check test file existence
    const allTests = Object.values(this.testSuites).flat();
    const missingTests = allTests.filter(test => !existsSync(test));
    
    if (missingTests.length > 0) {
      console.log('❌ Missing test files:');
      missingTests.forEach(test => console.log(`   - ${test}`));
      throw new Error('Test files missing - run from project root');
    } else {
      console.log('✅ All test files found');
    }

    console.log('');
  }

  getTestsToRun(category) {
    if (category === 'all') {
      return Object.values(this.testSuites).flat();
    } else if (this.testSuites[category]) {
      return this.testSuites[category];
    } else {
      return [];
    }
  }

  async runSingleTest(testFile) {
    console.log(`🧪 Running: ${testFile}`);
    console.log('-' * 50);
    
    const startTime = Date.now();
    this.results.total++;

    try {
      const result = await this.executeTest(testFile);
      const duration = Date.now() - startTime;
      
      if (result.success) {
        this.results.passed++;
        console.log(`✅ PASSED: ${testFile} (${duration}ms)`);
        
        this.results.details.push({
          file: testFile,
          status: 'PASSED',
          duration,
          output: result.output
        });
      } else {
        this.results.failed++;
        console.log(`❌ FAILED: ${testFile} (${duration}ms)`);
        console.log(`Error: ${result.error}`);
        
        this.results.details.push({
          file: testFile,
          status: 'FAILED',
          duration,
          error: result.error,
          output: result.output
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.failed++;
      console.log(`❌ ERROR: ${testFile} (${duration}ms)`);
      console.log(`Exception: ${error.message}`);
      
      this.results.details.push({
        file: testFile,
        status: 'ERROR',
        duration,
        error: error.message
      });
    }
    
    console.log('');
  }

  executeTest(testFile) {
    return new Promise((resolve) => {
      const child = spawn('node', [testFile], {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          error: code !== 0 ? `Exit code: ${code}` : null,
          output: stdout,
          stderr: stderr
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          output: stdout,
          stderr: stderr
        });
      });
    });
  }

  generateFinalReport() {
    console.log('=' * 60);
    console.log('📊 FINAL TEST RESULTS');
    console.log('=' * 60);
    
    console.log(`\n🎯 SUMMARY:`);
    console.log(`   Total Tests: ${this.results.total}`);
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    console.log(`   Success Rate: ${Math.round((this.results.passed / this.results.total) * 100)}%`);
    
    console.log(`\n📋 DETAILED RESULTS:`);
    this.results.details.forEach((result, index) => {
      const statusIcon = result.status === 'PASSED' ? '✅' : '❌';
      const fileName = path.basename(result.file);
      console.log(`   ${index + 1}. ${fileName}: ${statusIcon} ${result.status} (${result.duration}ms)`);
      
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });
    
    if (this.results.failed === 0) {
      console.log(`\n🎉 ALL TESTS PASSED!`);
      console.log(`✅ Test suite is working correctly`);
      console.log(`✅ Ready for development and production use`);
    } else {
      console.log(`\n❌ ${this.results.failed} TEST(S) FAILED`);
      console.log(`⚠️  Please check the errors above and fix before proceeding`);
    }
    
    console.log('\n' + '=' * 60);
  }
}

// Main execution
async function main() {
  const category = process.argv[2] || 'all';
  const runner = new TestRunner();
  
  try {
    await runner.run(category);
  } catch (error) {
    console.error('\n💥 TEST RUNNER FAILED:', error.message);
    process.exit(1);
  }
}

// Handle module import vs direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  // Add fetch polyfill for Node.js if needed
  if (typeof fetch === 'undefined') {
    global.fetch = (await import('node-fetch')).default;
  }
  
  main().catch(console.error);
}

export default TestRunner; 