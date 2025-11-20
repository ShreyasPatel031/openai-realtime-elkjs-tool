/**
 * Simple Canvas Placement Test
 * Direct test of orchestrator node placement functionality
 */

import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';

describe('Canvas Placement - Direct Orchestrator Test', () => {
  it('should place node on canvas using orchestrator directly', async () => {
    // Setup test environment
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: any[] = [];
    let capturedEdges: any[] = [];

    console.log('🎯 [TEST] Initializing orchestrator...');

    // Initialize orchestrator
    initializeOrchestrator(
      testGraph,
      testViewState,
      () => { 
        console.log('🎯 [TEST] Render trigger called'); 
      }, 
      (graph) => { 
        testGraph.current = graph;
        console.log('🎯 [TEST] Graph callback - children:', graph?.children?.length || 0);
      },
      (nodes) => { 
        capturedNodes = [...nodes];
        console.log('🎯 [TEST] Nodes callback - count:', nodes.length);
        if (nodes.length > 0) {
          console.log('🎯 [TEST] First node:', {
            id: nodes[0].id,
            position: nodes[0].position,
            data: nodes[0].data
          });
        }
      },
      (edges) => { 
        capturedEdges = [...edges];
        console.log('🎯 [TEST] Edges callback - count:', edges.length);
      }
    );

    // Test coordinates - simulate user clicking at 400, 300
    const userClickPosition = { x: 400, y: 300 };
    const NODE_SIZE = 96;
    const GRID_SIZE = 16;
    const snap = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

    // Calculate expected position (same as placeNodeOnCanvas logic)
    const snappedCenter = { x: snap(userClickPosition.x), y: snap(userClickPosition.y) };
    const topLeft = { 
      x: snappedCenter.x - NODE_SIZE / 2, 
      y: snappedCenter.y - NODE_SIZE / 2 
    };

    console.log('🎯 [TEST] Position calculation:');
    console.log('  - User click:', userClickPosition);
    console.log('  - Snapped center:', snappedCenter);
    console.log('  - Expected top-left:', topLeft);

    // Create add-node intent (same as placeNodeOnCanvas creates)
    const nodeId = `test-node-${Date.now()}`;
    const intent = {
      source: 'user' as const,
      kind: 'free-structural' as const,
      scopeId: 'root',
      payload: {
        action: 'add-node' as const,
        nodeId: nodeId,
        parentId: 'root',
        position: { x: topLeft.x, y: topLeft.y },
        size: { w: NODE_SIZE, h: NODE_SIZE },
        data: {
          label: 'Test Node',
        }
      }
    };

    console.log('🎯 [TEST] Applying intent:', intent);

    // Apply the intent directly
    try {
      await apply(intent);
      console.log('🎯 [TEST] Apply completed successfully');
    } catch (error) {
      console.error('🎯 [TEST] Apply failed:', error);
      throw error;
    }

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Debug final state
    console.log('🎯 [TEST] Final state:');
    console.log('  - Graph children:', testGraph.current?.children?.length || 0);
    console.log('  - ViewState nodes:', Object.keys(testViewState.current?.node || {}).length);
    console.log('  - Captured nodes:', capturedNodes.length);

    if (testGraph.current?.children?.length > 0) {
      console.log('  - Graph child IDs:', testGraph.current.children.map(c => c.id));
    }

    if (Object.keys(testViewState.current?.node || {}).length > 0) {
      console.log('  - ViewState node IDs:', Object.keys(testViewState.current.node));
    }

    // Verify node was created in domain
    expect(testGraph.current.children.length).toBe(1);
    expect(testGraph.current.children[0].id).toBe(nodeId);

    // Verify ViewState was written
    expect(Object.keys(testViewState.current.node).length).toBe(1);
    expect(testViewState.current.node[nodeId]).toBeDefined();
    
    const viewStateGeometry = testViewState.current.node[nodeId];
    expect(viewStateGeometry.x).toBe(topLeft.x);
    expect(viewStateGeometry.y).toBe(topLeft.y);
    expect(viewStateGeometry.w).toBe(NODE_SIZE);
    expect(viewStateGeometry.h).toBe(NODE_SIZE);

    // Verify node was rendered
    expect(capturedNodes.length).toBe(1);
    const renderedNode = capturedNodes[0];
    expect(renderedNode.id).toBe(nodeId);
    expect(renderedNode.position.x).toBe(topLeft.x);
    expect(renderedNode.position.y).toBe(topLeft.y);

    console.log('✅ [TEST] All verifications passed!');
    console.log('  - Domain: ✅ Node added to graph');
    console.log('  - ViewState: ✅ Geometry written correctly');
    console.log('  - Renderer: ✅ Node rendered at correct position');
  });

  it('should handle positioning calculation correctly', () => {
    // Test the coordinate transformation logic directly
    const testCases = [
      { click: { x: 100, y: 100 }, expected: { x: 48, y: 48 } },   // Simple case
      { click: { x: 400, y: 300 }, expected: { x: 352, y: 256 } }, // Main test case
      { click: { x: 0, y: 0 }, expected: { x: -48, y: -48 } },     // Edge case
      { click: { x: 33, y: 17 }, expected: { x: -16, y: -32 } },   // Odd coordinates
    ];

    const NODE_SIZE = 96;
    const GRID_SIZE = 16;
    const snap = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

    testCases.forEach(({ click, expected }, index) => {
      const snappedCenter = { x: snap(click.x), y: snap(click.y) };
      const topLeft = { 
        x: snappedCenter.x - NODE_SIZE / 2, 
        y: snappedCenter.y - NODE_SIZE / 2 
      };

      console.log(`🎯 [TEST] Case ${index + 1}:`, {
        click,
        snappedCenter,
        topLeft,
        expected
      });

      expect(topLeft.x).toBe(expected.x);
      expect(topLeft.y).toBe(expected.y);
    });

    console.log('✅ [TEST] Position calculations verified');
  });
});
