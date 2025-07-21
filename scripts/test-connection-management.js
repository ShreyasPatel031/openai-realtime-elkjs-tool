#!/usr/bin/env node

import fetch from 'node-fetch';

// Configuration
const SERVER_URL = 'http://localhost:3000';
const NUM_TERMINALS = 3;

// Simple test payload using the chat endpoint (not streaming)
const testPayload = {
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Say hello and mention this is a connection test." }
  ]
};

async function testTerminal(terminalId) {
  const startTime = Date.now();
  console.log(`🚀 Terminal ${terminalId}: Starting connection test...`);
  
  try {
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': `test-terminal-${terminalId}-${Date.now()}`
      },
      body: JSON.stringify(testPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Terminal ${terminalId}: Success in ${duration}ms`);
    console.log(`📝 Response: ${result.message?.content || 'No content'}`);
    
    return { success: true, duration, terminalId };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Terminal ${terminalId}: Failed after ${duration}ms - ${error.message}`);
    return { success: false, duration, terminalId, error: error.message };
  }
}

async function checkStats() {
  try {
    const response = await fetch(`${SERVER_URL}/api/connection-stats`);
    const stats = await response.json();
    console.log(`📊 Connection Stats:`, {
      active: stats.activeConnections,
      queued: stats.queuedRequests,
      completed: stats.completedRequests,
      failed: stats.failedRequests,
      timeouts: stats.totalTimeouts
    });
  } catch (error) {
    console.error(`❌ Failed to get stats: ${error.message}`);
  }
}

async function runConcurrentTest() {
  console.log(`🎯 Starting concurrent connection test with ${NUM_TERMINALS} terminals...`);
  
  // Check initial stats
  console.log('\n📊 Initial connection stats:');
  await checkStats();
  
  // Launch all terminals concurrently
  const terminals = [];
  for (let i = 1; i <= NUM_TERMINALS; i++) {
    terminals.push(testTerminal(i));
  }
  
  console.log(`\n🔄 Running ${NUM_TERMINALS} concurrent connections...`);
  const results = await Promise.allSettled(terminals);
  
  // Analyze results
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - successful;
  const avgDuration = results
    .filter(r => r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value.duration, 0) / results.length;
  
  console.log(`\n🎯 TEST COMPLETED`);
  console.log(`================`);
  console.log(`✅ Successful: ${successful}/${NUM_TERMINALS} (${(successful/NUM_TERMINALS*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed}/${NUM_TERMINALS} (${(failed/NUM_TERMINALS*100).toFixed(1)}%)`);
  console.log(`⏱️  Average duration: ${avgDuration.toFixed(0)}ms`);
  
  // Check final stats
  console.log('\n📊 Final connection stats:');
  await checkStats();
  
  // Wait a moment for queue to clear
  console.log('\n⏳ Waiting 2 seconds for connections to settle...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n📊 Final stats after settling:');
  await checkStats();
}

// Run the test
runConcurrentTest().catch(console.error); 