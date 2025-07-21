#!/usr/bin/env node

import fetch from 'node-fetch';

// Configuration
const SERVER_URL = 'http://localhost:3000';
const NUM_CONCURRENT_TERMINALS = 5;
const REQUESTS_PER_TERMINAL = 3;

// Test payloads for different scenarios
const testPayloads = [
  {
    name: "Simple Architecture",
    conversation: JSON.stringify([
      { role: "system", content: "You are an architecture assistant." },
      { role: "user", content: "Create a simple web application with frontend and backend." }
    ])
  },
  {
    name: "Database System",
    conversation: JSON.stringify([
      { role: "system", content: "You are an architecture assistant." },
      { role: "user", content: "Design a database system with primary and replica servers." }
    ])
  },
  {
    name: "Microservices",
    conversation: JSON.stringify([
      { role: "system", content: "You are an architecture assistant." },
      { role: "user", content: "Create a microservices architecture with API gateway." }
    ])
  },
  {
    name: "Cloud Infrastructure",
    conversation: JSON.stringify([
      { role: "system", content: "You are an architecture assistant." },
      { role: "user", content: "Design a cloud infrastructure with load balancers and auto-scaling." }
    ])
  },
  {
    name: "Data Pipeline",
    conversation: JSON.stringify([
      { role: "system", content: "You are an architecture assistant." },
      { role: "user", content: "Create a data processing pipeline with streaming and batch processing." }
    ])
  }
];

// Terminal session simulator
class TerminalSession {
  constructor(id) {
    this.id = id;
    this.sessionId = `terminal-${id}-${Date.now()}`;
    this.stats = {
      requests: 0,
      successful: 0,
      failed: 0,
      totalTime: 0
    };
  }

  async makeRequest(payload, requestNum) {
    const startTime = Date.now();
    
    try {
      console.log(`🚀 Terminal ${this.id}: Starting request ${requestNum} (${payload.name})`);
      
      const response = await fetch(`${SERVER_URL}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': `${this.sessionId}-req-${requestNum}`
        },
        body: JSON.stringify({
          payload: payload.conversation,
          isCompressed: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read the stream until completion
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let messageCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log(`✅ Terminal ${this.id}: Request ${requestNum} completed (${messageCount} messages)`);
            return;
          }
          messageCount++;
        }
      }

      const duration = Date.now() - startTime;
      this.stats.successful++;
      this.stats.totalTime += duration;
      
      console.log(`✅ Terminal ${this.id}: Request ${requestNum} completed in ${duration}ms`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failed++;
      this.stats.totalTime += duration;
      
      console.error(`❌ Terminal ${this.id}: Request ${requestNum} failed after ${duration}ms:`, error.message);
    } finally {
      this.stats.requests++;
    }
  }

  async runSequence() {
    console.log(`🎯 Starting terminal ${this.id} with ${REQUESTS_PER_TERMINAL} requests`);
    
    for (let i = 1; i <= REQUESTS_PER_TERMINAL; i++) {
      const payload = testPayloads[(this.id + i - 1) % testPayloads.length];
      await this.makeRequest(payload, i);
      
      // Small delay between requests within the same terminal
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`🏁 Terminal ${this.id} completed:`, this.stats);
    return this.stats;
  }
}

// Connection stats monitor
async function getConnectionStats() {
  try {
    const response = await fetch(`${SERVER_URL}/api/connection-stats`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Could not fetch connection stats:', error.message);
  }
  return null;
}

// Main test function
async function runParallelTerminalTest() {
  console.log(`🧪 Starting concurrent terminal test`);
  console.log(`📊 Configuration: ${NUM_CONCURRENT_TERMINALS} terminals × ${REQUESTS_PER_TERMINAL} requests each`);
  console.log(`🌐 Server: ${SERVER_URL}`);
  console.log('');

  // Check initial connection stats
  const initialStats = await getConnectionStats();
  if (initialStats) {
    console.log('📈 Initial connection stats:', initialStats);
  }
  console.log('');

  const startTime = Date.now();
  
  // Create terminal sessions
  const terminals = Array.from({ length: NUM_CONCURRENT_TERMINALS }, (_, i) => new TerminalSession(i + 1));
  
  // Run all terminals in parallel
  const results = await Promise.all(terminals.map(terminal => terminal.runSequence()));
  
  const totalTime = Date.now() - startTime;
  
  // Calculate overall statistics
  const totalStats = results.reduce((acc, stats) => ({
    requests: acc.requests + stats.requests,
    successful: acc.successful + stats.successful,
    failed: acc.failed + stats.failed,
    totalTime: acc.totalTime + stats.totalTime
  }), { requests: 0, successful: 0, failed: 0, totalTime: 0 });

  // Get final connection stats
  const finalStats = await getConnectionStats();
  
  console.log('');
  console.log('🎯 TEST COMPLETED');
  console.log('================');
  console.log(`⏱️  Total test time: ${totalTime}ms`);
  console.log(`📊 Total requests: ${totalStats.requests}`);
  console.log(`✅ Successful: ${totalStats.successful} (${(totalStats.successful / totalStats.requests * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${totalStats.failed} (${(totalStats.failed / totalStats.requests * 100).toFixed(1)}%)`);
  console.log(`📈 Average request time: ${Math.round(totalStats.totalTime / totalStats.requests)}ms`);
  console.log('');
  
  if (finalStats) {
    console.log('📈 Final connection stats:');
    console.log(`   Active connections: ${finalStats.activeConnections}`);
    console.log(`   Queued requests: ${finalStats.queuedRequests}`);
    console.log(`   Completed requests: ${finalStats.completedRequests}`);
    console.log(`   Failed requests: ${finalStats.failedRequests}`);
    console.log(`   Total timeouts: ${finalStats.totalTimeouts}`);
  }

  // Exit with appropriate code
  process.exit(totalStats.failed > 0 ? 1 : 0);
}

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(130);
});

// Run the test
runParallelTerminalTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 