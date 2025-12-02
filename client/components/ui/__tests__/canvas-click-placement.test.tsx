/**
 * Canvas Click Placement Integration Test
 * Tests the real click-to-place node functionality
 */

import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';
import { placeNodeOnCanvas } from '../../../utils/canvas/canvasInteractions';

// Mock ReactFlow ref
const createMockReactFlowRef = () => ({
  current: {
    project: (screenPoint: { x: number; y: number }) => ({
      x: screenPoint.x - 50, // Simulate viewport offset
      y: screenPoint.y - 100
    }),
    screenToFlowPosition: (screenPoint: { x: number; y: number }) => ({
      x: screenPoint.x - 50,
      y: screenPoint.y - 100
    }),
    fitView: jest.fn(),
    setViewport: jest.fn(),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 })
  }
});

// Mock MouseEvent
const createMockMouseEvent = (clientX: number, clientY: number): MouseEvent => ({
  clientX,
  clientY,
  target: { classList: { contains: () => true } },
  preventDefault: jest.fn(),
  stopPropagation: jest.fn()
} as any);

describe('Canvas Click Placement Integration', () => {
  jest.setTimeout(20000); // Increase timeout for async rendering

  it('should place node exactly where user clicks on canvas', async () => {
    // Setup test environment
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {}, layout: {} } };
    let renderedNodes: any[] = [];
    let renderedEdges: any[] = [];

    // Initialize orchestrator (real implementation)
    initializeOrchestrator(
      testGraph,
      testViewState,
      () => { 
        console.log('🎯 [TEST] Render trigger called'); 
      }, 
      (graph) => { 
        testGraph.current = graph;
        console.log('🎯 [TEST] Graph updated:', {
          children: graph?.children?.length || 0,
          childIds: graph?.children?.map(c => c.id) || []
        });
      },
      (nodes) => { 
        renderedNodes = [...nodes];
        console.log('🎯 [TEST] Nodes rendered:', nodes.map(n => ({
          id: n.id,
          position: n.position
        })));
      },
      (edges) => { renderedEdges = [...edges]; }
    );

    // Simulate real user interaction
    const userClickPosition = { x: 400, y: 300 };
    const mockEvent = createMockMouseEvent(userClickPosition.x, userClickPosition.y);
    const mockReactFlowRef = createMockReactFlowRef();
    
    console.log('🎯 [TEST] Simulating user click at:', userClickPosition);

    // Call placeNodeOnCanvas (real implementation) - it returns void but triggers async operations
    try {
      placeNodeOnCanvas(
        mockEvent,
        'box', // selectedTool
        mockReactFlowRef,
        testViewState,
        (nextTool) => {
          console.log('🎯 [TEST] Tool changed to:', nextTool);
        },
        'root' // parentId
      );

      // Wait for async operations to complete - rendering happens via dynamic import
      // Wait for nodes to appear in rendered array
      let attempts = 0;
      while (renderedNodes.length === 0 && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      console.log('🎯 [TEST] After placeNodeOnCanvas:');
      console.log('  - Graph children:', testGraph.current?.children?.length || 0);
      console.log('  - ViewState nodes:', Object.keys(testViewState.current?.node || {}).length);
      console.log('  - Rendered nodes:', renderedNodes.length);

    } catch (error) {
      console.error('🎯 [TEST] Error in placeNodeOnCanvas:', error);
      throw error;
    }

    // Verify node was created
    expect(renderedNodes.length).toBe(1);
    const createdNode = renderedNodes[0];
    expect(createdNode.id).toMatch(/^user-node-\d+$/);

    // Calculate expected position (same logic as placeNodeOnCanvas)
    const NODE_SIZE = 96;
    const GRID_SIZE = 16;
    const snap = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;
    
    // Transform screen coordinates to world coordinates
    const worldPos = mockReactFlowRef.current.project(userClickPosition);
    const snappedCenter = { x: snap(worldPos.x), y: snap(worldPos.y) };
    const expectedTopLeft = {
      x: snappedCenter.x - NODE_SIZE / 2,
      y: snappedCenter.y - NODE_SIZE / 2
    };

    console.log('🎯 [TEST] Position calculation:');
    console.log('  - User clicked at:', userClickPosition);
    console.log('  - World coordinates:', worldPos);
    console.log('  - Snapped center:', snappedCenter);
    console.log('  - Expected top-left:', expectedTopLeft);
    console.log('  - Actual node position:', createdNode.position);

    // Verify position matches expected calculation
    expect(createdNode.position.x).toBe(expectedTopLeft.x);
    expect(createdNode.position.y).toBe(expectedTopLeft.y);

    // Verify node has correct size
    expect(createdNode.data.width).toBe(NODE_SIZE);
    expect(createdNode.data.height).toBe(NODE_SIZE);
    expect(createdNode.style.width).toBe(NODE_SIZE);
    expect(createdNode.style.height).toBe(NODE_SIZE);

    console.log('✅ [TEST] Node placed correctly at calculated position');
  });

  it('should place multiple nodes at different click positions', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {}, layout: {} } };
    let renderedNodes: any[] = [];

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {}, 
      (graph) => { testGraph.current = graph; },
      (nodes) => { renderedNodes = [...nodes]; },
      (edges) => { }
    );

    const mockReactFlowRef = createMockReactFlowRef();
    const clickPositions = [
      { x: 200, y: 150 },
      { x: 450, y: 320 },
      { x: 100, y: 400 }
    ];

    // Place multiple nodes
    for (let i = 0; i < clickPositions.length; i++) {
      const clickPos = clickPositions[i];
      const mockEvent = createMockMouseEvent(clickPos.x, clickPos.y);
      
      placeNodeOnCanvas(
        mockEvent,
        'box',
        mockReactFlowRef,
        testViewState,
        () => {},
        'root'
      );

      // Wait for node to appear
      let attempts = 0;
      const expectedCount = i + 1;
      while (renderedNodes.length < expectedCount && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    }

    // Wait a bit more for final render
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify all nodes were created
    expect(renderedNodes.length).toBe(clickPositions.length);

    // Verify each node is at a different position
    const positions = renderedNodes.map(n => `${n.position.x},${n.position.y}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(clickPositions.length);

    console.log('✅ [TEST] Multiple nodes placed at different positions:', positions);
  });

  it('should handle edge cases: clicks at canvas boundaries', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {}, layout: {} } };
    let renderedNodes: any[] = [];

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {}, 
      (graph) => { testGraph.current = graph; },
      (nodes) => { renderedNodes = [...nodes]; },
      (edges) => { }
    );

    const mockReactFlowRef = createMockReactFlowRef();
    
    // Test edge cases
    const edgeCases = [
      { x: 0, y: 0 },        // Top-left corner
      { x: 1000, y: 800 },   // Far position
      { x: 48, y: 48 },      // Near grid boundary
      { x: 33, y: 17 }       // Odd coordinates
    ];

    for (let i = 0; i < edgeCases.length; i++) {
      const clickPos = edgeCases[i];
      const mockEvent = createMockMouseEvent(clickPos.x, clickPos.y);
      
      placeNodeOnCanvas(
        mockEvent,
        'box',
        mockReactFlowRef,
        testViewState,
        () => {},
        'root'
      );

      // Wait for node to appear
      let attempts = 0;
      const expectedCount = i + 1;
      while (renderedNodes.length < expectedCount && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    }

    // Wait a bit more for final render
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify all edge case nodes were created
    expect(renderedNodes.length).toBe(edgeCases.length);

    // Verify no nodes are at exactly 0,0 (the bug we fixed)
    const nodesAtZero = renderedNodes.filter(n => n.position.x === 0 && n.position.y === 0);
    expect(nodesAtZero.length).toBe(0);

    console.log('✅ [TEST] Edge cases handled correctly, no nodes at 0,0');
    renderedNodes.forEach((node, i) => {
      console.log(`  Node ${i + 1}: ${node.position.x},${node.position.y}`);
    });
  });
});
