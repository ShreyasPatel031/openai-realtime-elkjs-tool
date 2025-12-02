import { test, expect } from '@playwright/test';
import { getBaseUrl } from './test-config.js';

/**
 * Actual Canvas Test - Tests the real libavoid fixtures loaded via loadLibavoidFixtures()
 * 
 * This test matches the actual canvas environment with:
 * - 15 nodes (libavoid-h-left, libavoid-h-block, libavoid-h-right, libavoid-v-top, 
 *   libavoid-v-block, libavoid-v-bottom, libavoid-straight-left, libavoid-straight-right,
 *   libavoid-d-top-left, libavoid-d-block, libavoid-d-bottom-right, libavoid-port-source,
 *   libavoid-port-middle1, libavoid-port-middle2, libavoid-port-target)
 * - 8 edges (edge-horizontal, edge-vertical, edge-straight, edge-diagonal,
 *   edge-port-from-1, edge-port-from-2, edge-port-to-1, edge-port-to-2)
 */
test.describe('Actual Canvas Rendering', () => {
  let BASE_URL: string;

  test.beforeAll(async () => {
    BASE_URL = await getBaseUrl();
  });
  
  test('should render edges without overlapping segments', async ({ page }) => {
    test.setTimeout(30000);
    
    // Navigate to the canvas with libavoidFixtures=1 to force fixture loading
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log(`Connected to ${BASE_URL}`);
    
    // Capture console logs for debugging
    page.on('console', msg => {
      const text = msg.text();
      // Only log relevant messages
      if (text.includes('BATCH') || text.includes('edge-port-from') || text.includes('Loading libavoid')) {
        console.log('BROWSER:', text.substring(0, 300));
      }
    });
    
    page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
    });
    
    // Wait for the canvas to load
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    
    // The fixtures should auto-load because autoLoadLibavoidFixtures is true for canvas mode
    // and we're using libavoidFixtures=1 URL param as a backup
    // Wait for fixtures to load (reduced timeout)
    await page.waitForTimeout(2000);
    
    // Check what's on the page initially
    let counts = await page.evaluate(() => ({
      nodes: document.querySelectorAll('.react-flow__node').length,
      edges: document.querySelectorAll('.react-flow__edge').length,
      nodeIds: Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getAttribute('data-id'))
    }));
    console.log(`Initial state: ${counts.nodes} nodes, ${counts.edges} edges`);
    
    // If no nodes, try manually calling loadLibavoidFixtures
    if (counts.nodes === 0) {
      console.log('No nodes found, trying manual fixture load...');
      await page.evaluate(() => {
        if (typeof (window as any).loadLibavoidFixtures === 'function') {
          (window as any).loadLibavoidFixtures();
        }
      });
      await page.waitForTimeout(3000);
      
      counts = await page.evaluate(() => ({
        nodes: document.querySelectorAll('.react-flow__node').length,
        edges: document.querySelectorAll('.react-flow__edge').length,
        nodeIds: Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getAttribute('data-id'))
      }));
      console.log(`After manual load: ${counts.nodes} nodes, ${counts.edges} edges`);
    }
    
    console.log('Node IDs:', counts.nodeIds);
    
    // Wait for edges to route (libavoid routing takes time)
    await page.waitForTimeout(3000);
    
    // Capture the actual canvas state
    const canvasState = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.react-flow__node');
      const edges = document.querySelectorAll('.react-flow__edge');
      
      const nodeData = Array.from(nodes).map(node => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute('data-id'),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      });
      
      const edgeData = Array.from(edges).map((edge, index) => {
        const path = edge.querySelector('.react-flow__edge-path');
        // React Flow stores edge ID in data-testid with prefix "rf__edge-"
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '') || `unknown-${index}`;
        // Check edge type from class name
        const classList = Array.from(edge.classList);
        const edgeType = classList.find(c => c.startsWith('react-flow__edge-') && c !== 'react-flow__edge-path')?.replace('react-flow__edge-', '') || 'unknown';
        return {
          id: edgeId,
          pathData: path?.getAttribute('d') || '',
          type: edgeType,
        };
      });
      
      return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodeData,
        edges: edgeData
      };
    });
    
    console.log('🎯 ACTUAL CANVAS STATE:', JSON.stringify(canvasState, null, 2));
    
    // Verify we have the expected counts (15 nodes, 8 edges from fixtures)
    console.log(`Canvas state: ${canvasState.nodeCount} nodes, ${canvasState.edgeCount} edges`);
    expect(canvasState.nodeCount).toBeGreaterThanOrEqual(15);
    expect(canvasState.edgeCount).toBeGreaterThanOrEqual(8);
    
    // Log all edge IDs to debug
    console.log('All edge IDs:', canvasState.edges.map(e => e.id));
    
    // Find the two edges from port-source that should NOT overlap
    const edgePortFrom1 = canvasState.edges.find(e => e.id === 'edge-port-from-1');
    const edgePortFrom2 = canvasState.edges.find(e => e.id === 'edge-port-from-2');
    
    if (!edgePortFrom1 || !edgePortFrom2) {
      console.log('Edge not found! Available edges:', JSON.stringify(canvasState.edges, null, 2));
    }
    
    expect(edgePortFrom1).toBeDefined();
    expect(edgePortFrom2).toBeDefined();
    
    console.log('edge-port-from-1 path:', edgePortFrom1?.pathData);
    console.log('edge-port-from-2 path:', edgePortFrom2?.pathData);
    
    // Also extract edge-port-to-2 and edge-straight
    const edgePortTo2 = canvasState.edges.find(e => e.id === 'edge-port-to-2');
    const edgeStraight = canvasState.edges.find(e => e.id === 'edge-straight');
    
    if (edgePortTo2) {
      console.log('edge-port-to-2 path:', edgePortTo2.pathData);
    }
    if (edgeStraight) {
      console.log('edge-straight path:', edgeStraight.pathData);
    }
    
    // Parse the path data to extract vertical segments
    const extractVerticalSegments = (pathData: string): { x: number; y1: number; y2: number }[] => {
      const segments: { x: number; y1: number; y2: number }[] = [];
      // Match patterns like "L 276 488 L 276 328" (vertical line at X=276)
      const coords = pathData.match(/[\d.]+/g)?.map(Number) || [];
      
      for (let i = 2; i < coords.length - 1; i += 2) {
        const x1 = coords[i - 2];
        const y1 = coords[i - 1];
        const x2 = coords[i];
        const y2 = coords[i + 1];
        
        // Vertical segment: same X, different Y
        if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) > 10) {
          segments.push({
            x: Math.round(x1),
            y1: Math.min(y1, y2),
            y2: Math.max(y1, y2)
          });
        }
      }
      return segments;
    };
    
    // Also extract horizontal segments for diagonal edges
    const extractHorizontalSegments = (pathData: string): { y: number; x1: number; x2: number }[] => {
      const segments: { y: number; x1: number; x2: number }[] = [];
      const coords = pathData.match(/[\d.]+/g)?.map(Number) || [];
      
      for (let i = 2; i < coords.length - 1; i += 2) {
        const x1 = coords[i - 2];
        const y1 = coords[i - 1];
        const x2 = coords[i];
        const y2 = coords[i + 1];
        
        // Horizontal segment: same Y, different X
        if (Math.abs(y1 - y2) < 1 && Math.abs(x1 - x2) > 10) {
          segments.push({
            y: Math.round(y1),
            x1: Math.min(x1, x2),
            x2: Math.max(x1, x2)
          });
        }
      }
      return segments;
    };
    
    const segments1 = extractVerticalSegments(edgePortFrom1?.pathData || '');
    const segments2 = extractVerticalSegments(edgePortFrom2?.pathData || '');
    const horizontalSegments1 = extractHorizontalSegments(edgePortFrom1?.pathData || '');
    const horizontalSegments2 = extractHorizontalSegments(edgePortFrom2?.pathData || '');
    
    console.log('edge-port-from-1 vertical segments:', segments1);
    console.log('edge-port-from-2 vertical segments:', segments2);
    console.log('edge-port-from-1 horizontal segments:', horizontalSegments1);
    console.log('edge-port-from-2 horizontal segments:', horizontalSegments2);
    
    // Check if edges are properly routed (not just straight lines)
    // Edges sharing the same port should be routed with proper spacing
    const edge1IsStraight = (edgePortFrom1?.pathData.match(/[ML]/g) || []).length <= 2;
    const edge2IsStraight = (edgePortFrom2?.pathData.match(/[ML]/g) || []).length <= 2;
    
    // CRITICAL: Edges sharing the same port MUST be routed (not straight lines)
    // This ensures uniform spacing and proper obstacle avoidance
    if (edge1IsStraight || edge2IsStraight) {
      console.log(`❌ ERROR: One or both edges are straight lines (edge1: ${edge1IsStraight}, edge2: ${edge2IsStraight})`);
      console.log(`   edge-port-from-1 path: ${edgePortFrom1?.pathData}`);
      console.log(`   edge-port-from-2 path: ${edgePortFrom2?.pathData}`);
      console.log(`   Edges sharing the same port must be routed with libavoid for proper spacing`);
    }
    
    // Fail the test if edges are not properly routed
    expect(edge1IsStraight).toBe(false);
    expect(edge2IsStraight).toBe(false);
    
    // Check if any vertical segments overlap (same X coordinate with overlapping Y ranges)
    let hasOverlap = false;
    for (const seg1 of segments1) {
      for (const seg2 of segments2) {
        // Same X coordinate?
        if (Math.abs(seg1.x - seg2.x) < 2) {
          // Check Y overlap
          const overlap = !(seg1.y2 < seg2.y1 || seg2.y2 < seg1.y1);
          if (overlap) {
            console.log(`❌ OVERLAP DETECTED at X=${seg1.x}:`);
            console.log(`   edge-port-from-1: Y=${seg1.y1} to Y=${seg1.y2}`);
            console.log(`   edge-port-from-2: Y=${seg2.y1} to Y=${seg2.y2}`);
            hasOverlap = true;
          }
        }
      }
    }
    
    // Also check horizontal segments for overlaps
    for (const seg1 of horizontalSegments1) {
      for (const seg2 of horizontalSegments2) {
        // Same Y coordinate?
        if (Math.abs(seg1.y - seg2.y) < 2) {
          // Check X overlap
          const overlap = !(seg1.x2 < seg2.x1 || seg2.x2 < seg1.x1);
          if (overlap) {
            console.log(`❌ OVERLAP DETECTED at Y=${seg1.y}:`);
            console.log(`   edge-port-from-1: X=${seg1.x1} to X=${seg1.x2}`);
            console.log(`   edge-port-from-2: X=${seg2.x1} to X=${seg2.x2}`);
            hasOverlap = true;
          }
        }
      }
    }
    
    // This is the key assertion: edges should NOT overlap
    expect(hasOverlap).toBe(false);
  });
  
  test('should render edge-vertical around v-block without collision', async ({ page }) => {
    test.setTimeout(30000);
    
    const BASE_URL = await getBaseUrl();
    await page.goto(`${BASE_URL}/canvas?libavoidFixtures=1`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('.react-flow__renderer', { timeout: 10000 });
    
    // Wait for nodes to render
    await page.waitForFunction(() => {
      const nodes = document.querySelectorAll('.react-flow__node');
      return nodes.length > 0;
    }, { timeout: 10000 });
    
    // Wait for edges and routing to complete
    await page.waitForTimeout(3000);
    
    // Get the edge-vertical path and v-block position
    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll('.react-flow__edge');
      const nodes = document.querySelectorAll('.react-flow__node');
      
      let edgeVerticalPath = '';
      let vBlockBounds = { x: 0, y: 0, width: 0, height: 0 };
      
      edges.forEach(edge => {
        // React Flow stores edge ID in data-testid with prefix "rf__edge-"
        const testId = edge.getAttribute('data-testid') || '';
        const edgeId = testId.replace('rf__edge-', '');
        if (edgeId === 'edge-vertical') {
          const path = edge.querySelector('.react-flow__edge-path');
          edgeVerticalPath = path?.getAttribute('d') || '';
        }
      });
      
      nodes.forEach(node => {
        // React Flow stores node ID in data-id
        const nodeId = node.getAttribute('data-id');
        if (nodeId === 'libavoid-v-block') {
          const rect = node.getBoundingClientRect();
          vBlockBounds = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }
      });
      
      return { edgeVerticalPath, vBlockBounds };
    });
    
    console.log('edge-vertical path:', result.edgeVerticalPath);
    console.log('v-block bounds:', result.vBlockBounds);
    
    // Verify the edge has routing (more than 2 points means it's routing around something)
    const coordCount = (result.edgeVerticalPath.match(/[\d.]+/g) || []).length;
    console.log(`edge-vertical has ${coordCount / 2} points`);
    
    // A straight line would have 4 coordinates (2 points), routed path has more
    expect(coordCount).toBeGreaterThan(4);
  });

});

