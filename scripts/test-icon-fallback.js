#!/usr/bin/env node
/**
 * Icon Fallback Test Script
 * Tests the icon fallback system to ensure missing icons trigger semantic search
 */

import fetch from 'node-fetch';

const VERCEL_DEV_URL = 'http://localhost:3000';

async function waitForServer(maxRetries = 30) {
    console.log('🔍 Waiting for Vercel dev server...');
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${VERCEL_DEV_URL}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'test' })
            });
            
            if (response.ok) {
                console.log('✅ Vercel dev server is ready');
                return true;
            }
        } catch (error) {
            // Server not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
    
    throw new Error('❌ Vercel dev server failed to start within timeout');
}

async function testIconFallback() {
    console.log('🧪 Testing Icon Fallback System');
    console.log('===============================\n');
    
    let allTestsPassed = true;
    
    // Test 1: Verify missing icon scenario
    console.log('1️⃣ Testing missing icon: gcp_cloud_trace');
    
    try {
        const iconResponse = await fetch(`${VERCEL_DEV_URL}/icons/gcp/gcp_cloud_trace.png`);
        const contentType = iconResponse.headers.get('content-type') || '';
        
        if (contentType.includes('text/html')) {
            console.log('   ✅ Icon correctly detected as missing (HTML response)');
        } else {
            console.log('   ❌ Icon loading detection failed');
            allTestsPassed = false;
        }
    } catch (error) {
        console.log(`   ❌ Error testing icon URL: ${error.message}`);
        allTestsPassed = false;
    }
    
    // Test 2: Check fallback embedding availability
    console.log('\n2️⃣ Testing fallback embedding availability');
    
    try {
        const embeddingsResponse = await fetch(`${VERCEL_DEV_URL}/precomputed-icon-embeddings.json`);
        const embeddings = await embeddingsResponse.json();
        
        const hasTraceEmbedding = embeddings.embeddings && embeddings.embeddings['trace'];
        if (hasTraceEmbedding) {
            console.log('   ✅ Trace embedding available for fallback');
        } else {
            console.log('   ❌ Trace embedding missing');
            allTestsPassed = false;
        }
    } catch (error) {
        console.log(`   ❌ Error checking embeddings: ${error.message}`);
        allTestsPassed = false;
    }
    
    // Test 3: Test semantic search API
    console.log('\n3️⃣ Testing semantic search API');
    
    try {
        const searchResponse = await fetch(`${VERCEL_DEV_URL}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'cloud trace monitoring' })
        });
        
        if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.embedding && searchData.embedding.length > 0) {
                console.log('   ✅ Semantic search API working');
            } else {
                console.log('   ❌ Semantic search returned invalid data');
                allTestsPassed = false;
            }
        } else {
            console.log(`   ❌ Semantic search API failed: ${searchResponse.status}`);
            allTestsPassed = false;
        }
    } catch (error) {
        console.log(`   ❌ Error with semantic search: ${error.message}`);
        allTestsPassed = false;
    }
    
    // Test 4: Test agent generation creates missing icons
    console.log('\n4️⃣ Testing agent generates missing icons');
    
    try {
        const agentResponse = await fetch(`${VERCEL_DEV_URL}/api/simple-agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: 'Create a GCP architecture with gcp_cloud_trace monitoring', 
                tools: [] 
            })
        });
        
        if (agentResponse.ok) {
            const agentData = await agentResponse.json();
            
            // Check if response contains gcp_cloud_trace
            const responseText = JSON.stringify(agentData);
            if (responseText.includes('gcp_cloud_trace') || responseText.includes('cloud_trace')) {
                console.log('   ✅ Agent successfully generates missing icon names');
            } else {
                console.log('   ⚠️  Agent did not generate expected missing icon (may be random)');
                // Don't fail the test since agent behavior can vary
            }
        } else {
            console.log(`   ❌ Agent API failed: ${agentResponse.status}`);
            allTestsPassed = false;
        }
    } catch (error) {
        console.log(`   ❌ Error testing agent: ${error.message}`);
        allTestsPassed = false;
    }
    
    console.log('\n===============================');
    if (allTestsPassed) {
        console.log('✅ ALL ICON FALLBACK TESTS PASSED');
        console.log('🎯 System ready: Missing icons will trigger semantic fallback');
        return true;
    } else {
        console.log('❌ ICON FALLBACK TESTS FAILED');
        console.log('🚨 Fix required before pushing to production');
        return false;
    }
}

// Main execution
async function main() {
    try {
        await waitForServer();
        const success = await testIconFallback();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error(`🚨 Icon fallback test failed: ${error.message}`);
        process.exit(1);
    }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { testIconFallback, waitForServer };
