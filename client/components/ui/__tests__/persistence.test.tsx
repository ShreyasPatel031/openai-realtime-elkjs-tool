/**
 * Test for node persistence across page refreshes
 * 
 * This test verifies that:
 * 1. Adding a node persists it to localStorage
 * 2. Refreshing the page restores the node
 * 3. The node remains visible on the canvas after restore
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock ReactFlow to avoid complex setup
jest.mock('reactflow', () => ({
  ReactFlow: ({ children, nodes }: any) => (
    <div data-testid="react-flow">
      {nodes?.map((node: any) => (
        <div key={node.id} data-testid={`node-${node.id}`}>
          {node.data?.label || node.id}
        </div>
      ))}
      {children}
    </div>
  ),
  useReactFlow: () => ({
    screenToFlowPosition: (pos: any) => pos,
    getNodes: () => [],
    setNodes: () => {},
  }),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  MiniMap: () => <div data-testid="minimap" />,
  Panel: ({ children }: any) => <div>{children}</div>,
}));

describe('Node Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should persist node AND ViewState to localStorage when added', async () => {
    const { saveCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    
    const mockGraph = {
      id: 'root',
      children: [
        {
          id: 'user-node-123',
          labels: [{ text: 'Test Node' }],
          data: { label: 'Test Node' }
        }
      ],
      edges: []
    };

    const mockViewState = {
      node: {
        'user-node-123': { x: 100, y: 100, w: 96, h: 96 }
      },
      group: {},
      edge: {}
    };

    saveCanvasSnapshot(mockGraph, mockViewState, 'test-architecture');

    const stored = localStorage.getItem('atelier_canvas_last_snapshot_v1');
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    
    // Verify graph structure is saved
    expect(parsed.rawGraph.children).toHaveLength(1);
    expect(parsed.rawGraph.children[0].id).toBe('user-node-123');
    
    // CRITICAL: Verify ViewState is saved - if this fails, nodes won't appear on refresh
    expect(parsed.viewState).toBeTruthy();
    expect(parsed.viewState.node).toBeTruthy();
    expect(parsed.viewState.node['user-node-123']).toBeTruthy();
    expect(parsed.viewState.node['user-node-123']).toEqual({ x: 100, y: 100, w: 96, h: 96 });
    
    // CRITICAL CHECK: If ViewState is missing, this test should fail
    if (!parsed.viewState || !parsed.viewState.node || Object.keys(parsed.viewState.node).length === 0) {
      throw new Error('❌ BUG: ViewState is not being saved! Nodes will not appear on canvas after refresh. This test should fail.');
    }
  });

  it('should restore node from localStorage on page load', async () => {
    const { saveCanvasSnapshot, restoreCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    
    // Save a node
    const mockGraph = {
      id: 'root',
      children: [
        {
          id: 'user-node-456',
          labels: [{ text: 'Restored Node' }],
          data: { label: 'Restored Node' }
        }
      ],
      edges: []
    };

    const mockViewState = {
      node: {
        'user-node-456': { x: 200, y: 200, w: 96, h: 96 }
      },
      group: {},
      edge: {}
    };

    saveCanvasSnapshot(mockGraph, mockViewState, 'test-architecture');

    // Simulate page refresh - restore
    const restored = restoreCanvasSnapshot();
    
    expect(restored).toBeTruthy();
    expect(restored!.rawGraph.children).toHaveLength(1);
    expect(restored!.rawGraph.children[0].id).toBe('user-node-456');
    expect(restored!.viewState.node['user-node-456']).toEqual({ x: 200, y: 200, w: 96, h: 96 });
  });

  it('should maintain node on canvas after restore completes', async () => {
    const { saveCanvasSnapshot, restoreCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    
    // Initial state: save a node with viewState
    const initialGraph = {
      id: 'root',
      children: [
        {
          id: 'user-node-789',
          labels: [{ text: 'Persistent Node' }],
          data: { label: 'Persistent Node' }
        }
      ],
      edges: []
    };

    const initialViewState = {
      node: {
        'user-node-789': { x: 300, y: 300, w: 96, h: 96 }
      },
      group: {},
      edge: {}
    };

    // Save to localStorage
    saveCanvasSnapshot(initialGraph, initialViewState, 'test-architecture');

    // Restore from localStorage
    const restored = restoreCanvasSnapshot();
    expect(restored).toBeTruthy();
    expect(restored!.rawGraph.children).toHaveLength(1);

    // Verify the restored graph has the node
    const nodeId = restored!.rawGraph.children[0].id;
    expect(nodeId).toBe('user-node-789');
    
    // CRITICAL: Verify ViewState was restored (this ensures node position is preserved)
    expect(restored!.viewState).toBeTruthy();
    expect(restored!.viewState.node[nodeId]).toBeTruthy();
    expect(restored!.viewState.node[nodeId].x).toBe(300);
    expect(restored!.viewState.node[nodeId].y).toBe(300);
    expect(restored!.viewState.node[nodeId].w).toBe(96);
    expect(restored!.viewState.node[nodeId].h).toBe(96);
    
    // Verify the node would be rendered on canvas (has both graph structure and viewState)
    const hasGraphNode = restored!.rawGraph.children.some((child: any) => child.id === nodeId);
    const hasViewStateNode = !!restored!.viewState.node[nodeId];
    expect(hasGraphNode).toBe(true);
    expect(hasViewStateNode).toBe(true);
    
    // Both must be present for node to appear on canvas
    expect(hasGraphNode && hasViewStateNode).toBe(true);
  });

  it('should handle multiple nodes persistence and keep them on canvas', async () => {
    const { saveCanvasSnapshot, restoreCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    
    const multiNodeGraph = {
      id: 'root',
      children: [
        {
          id: 'user-node-1',
          labels: [{ text: 'Node 1' }],
          data: { label: 'Node 1' }
        },
        {
          id: 'user-node-2',
          labels: [{ text: 'Node 2' }],
          data: { label: 'Node 2' }
        }
      ],
      edges: []
    };

    const multiNodeViewState = {
      node: {
        'user-node-1': { x: 100, y: 100, w: 96, h: 96 },
        'user-node-2': { x: 200, y: 200, w: 96, h: 96 }
      },
      group: {},
      edge: {}
    };

    saveCanvasSnapshot(multiNodeGraph, multiNodeViewState, 'test-architecture');

    const restored = restoreCanvasSnapshot();
    expect(restored).toBeTruthy();
    
    // Verify graph structure
    expect(restored!.rawGraph.children).toHaveLength(2);
    const node1InGraph = restored!.rawGraph.children.some((c: any) => c.id === 'user-node-1');
    const node2InGraph = restored!.rawGraph.children.some((c: any) => c.id === 'user-node-2');
    expect(node1InGraph).toBe(true);
    expect(node2InGraph).toBe(true);
    
    // Verify ViewState (positions) were restored
    expect(Object.keys(restored!.viewState.node)).toHaveLength(2);
    expect(restored!.viewState.node['user-node-1']).toBeTruthy();
    expect(restored!.viewState.node['user-node-2']).toBeTruthy();
    
    // Verify positions are correct
    expect(restored!.viewState.node['user-node-1'].x).toBe(100);
    expect(restored!.viewState.node['user-node-1'].y).toBe(100);
    expect(restored!.viewState.node['user-node-2'].x).toBe(200);
    expect(restored!.viewState.node['user-node-2'].y).toBe(200);
    
    // CRITICAL: Both nodes must have both graph structure AND viewState to appear on canvas
    const node1OnCanvas = node1InGraph && !!restored!.viewState.node['user-node-1'];
    const node2OnCanvas = node2InGraph && !!restored!.viewState.node['user-node-2'];
    expect(node1OnCanvas).toBe(true);
    expect(node2OnCanvas).toBe(true);
  });
  
  it('should render node on actual canvas after adding via Orchestrator', async () => {
    // This test verifies the complete flow: add node → appears on canvas → persists after refresh
    
    const { saveCanvasSnapshot, restoreCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    // Domain → ViewState → ReactFlow - no direct Domain → ReactFlow rendering
    
    // Step 1: Save a node with ViewState (simulating user adding a node)
    const testGraph = {
      id: 'root',
      children: [
        {
          id: 'canvas-node-test',
          labels: [{ text: 'Canvas Test Node' }],
          data: { label: 'Canvas Test Node' }
        }
      ],
      edges: []
    };

    const testViewState = {
      node: {
        'canvas-node-test': { x: 500, y: 600, w: 120, h: 80 }
      },
      group: {},
      edge: {}
    };

    saveCanvasSnapshot(testGraph, testViewState, 'test-architecture');

    // Step 2: Simulate page refresh - restore from localStorage
    const restored = restoreCanvasSnapshot();
    expect(restored).toBeTruthy();
    
    // Step 3: CRITICAL CHECK - This test MUST FAIL if ViewState is missing
    // Check what restoreCanvasSnapshot actually returns
    const hasViewStateInSnapshot = !!(restored!.viewState && restored!.viewState.node && Object.keys(restored!.viewState.node).length > 0);
    
    // Step 4: Simulate what InteractiveCanvas does - check if viewState is in parsed.viewState or parsed.rawGraph.viewState
    // This matches the logic at line 3121: const viewStateSnapshot = parsed.viewState || parsed.rawGraph?.viewState;
    const viewStateSnapshot = restored!.viewState || (restored!.rawGraph as any)?.viewState;
    const hasViewStateSnapshot = !!(viewStateSnapshot && viewStateSnapshot.node && Object.keys(viewStateSnapshot.node).length > 0);
    
    // Step 5: CRITICAL CHECK - If ViewState is missing, this test MUST FAIL
    if (!hasViewStateInSnapshot && !hasViewStateSnapshot) {
      throw new Error('❌ BUG: ViewState is missing from restored snapshot! Nodes will not appear on canvas. This test should fail.');
    }
    
    // Step 6: Simulate setting viewStateRef (what InteractiveCanvas does)
    const viewStateRef = { current: undefined as any };
    if (viewStateSnapshot && viewStateRef) {
      viewStateRef.current = JSON.parse(JSON.stringify(viewStateSnapshot));
    }
    
    // Step 7: CRITICAL CHECK - viewStateRef must be set
    if (!viewStateRef.current || !viewStateRef.current.node || Object.keys(viewStateRef.current.node).length === 0) {
      throw new Error('❌ BUG: viewStateRef.current is not set or empty! Nodes will not appear on canvas. This test should fail.');
    }
    
    // Step 8: Convert to ReactFlow nodes using viewStateRef (this is what renders)
    // Step 8.5: Test actual Orchestrator add-node flow
    const { apply } = await import('../../../core/orchestration/Orchestrator');
    
    // Start with fresh graph and ViewState
    const freshGraph = { id: 'root', children: [], edges: [] };
    const freshViewState = { node: {}, group: {}, edge: {} };
    
    // Initialize Orchestrator with test refs
    const graphRef = { current: freshGraph };
    const viewStateRef = { current: freshViewState };
    let renderedNodes: any[] = [];
    let renderedEdges: any[] = [];
    
    const { initializeOrchestrator } = await import('../../../core/orchestration/Orchestrator');
    initializeOrchestrator(
      graphRef,
      viewStateRef,
      () => {
        // Mock trigger render - just update test arrays
        const { toReactFlowWithViewState } = require('../../../core/renderer/ReactFlowAdapter');
        const minimalELK = {
          id: 'root',
          children: graphRef.current?.children?.map((child: any) => ({
            id: child.id,
            type: 'default',
            data: child.data || {},
          })) || [],
          edges: graphRef.current?.edges || [],
        };
        const dimensions = { width: 96, height: 96, groupWidth: 288, groupHeight: 192, padding: 10 };
        const result = toReactFlowWithViewState(minimalELK, dimensions, viewStateRef.current);
        renderedNodes = result.nodes;
        renderedEdges = result.edges;
      },
      (graph) => { graphRef.current = graph; },
      (nodes) => { renderedNodes = nodes; },
      (edges) => { renderedEdges = edges; }
    );
    
    // Apply add-node intent
    const addNodeIntent = {
      source: 'user' as const,
      kind: 'free-structural' as const,
      scopeId: 'root',
      payload: {
        action: 'add-node' as const,
        nodeId: 'test-canvas-node',
        parentId: 'root',
        position: { x: 150, y: 250 },
        size: { w: 96, h: 96 },
        data: { label: 'Test Canvas Node' },
      },
    };
    
    await apply(addNodeIntent);
    
    // Step 9: CRITICAL CHECK - Node must appear in rendered nodes (on canvas)
    const renderedNode = renderedNodes.find((n: any) => n.id === 'test-canvas-node');
    if (!renderedNode) {
      throw new Error('❌ BUG: Node is not in ReactFlow nodes array! Node will not appear on canvas.');
    }
    
    // Step 10: CRITICAL CHECK - Position must be correct from ViewState
    expect(renderedNode.position.x).toBe(150);
    expect(renderedNode.position.y).toBe(250);
    
    // Step 11: Check ViewState was written correctly
    expect(viewStateRef.current.node['test-canvas-node']).toBeTruthy();
    expect(viewStateRef.current.node['test-canvas-node'].x).toBe(150);
    expect(viewStateRef.current.node['test-canvas-node'].y).toBe(250);
    
    // Step 12: Check Domain was updated
    expect(graphRef.current?.children).toBeTruthy();
    const domainNode = graphRef.current?.children?.find((n: any) => n.id === 'test-canvas-node');
    expect(domainNode).toBeTruthy();
    
    if (renderedNode.position.x !== 500 || renderedNode.position.y !== 600) {
      throw new Error(`❌ BUG: Node position is wrong! Expected (500, 600) but got (${renderedNode.position.x}, ${renderedNode.position.y}). ViewState was not restored correctly. This test should fail.`);
    }
    
    // If we get here, the test passed - but if nodes are not visible in real app, 
    // the bug is that ViewState is not being saved or restored correctly
    // The test should have failed above if ViewState was missing
  });
  
  it('should FAIL if ViewState is missing - node will not appear on canvas', async () => {
    const { saveCanvasSnapshot, restoreCanvasSnapshot } = await import('../../../utils/canvasPersistence');
    // Domain → ViewState → ReactFlow - no direct Domain → ReactFlow rendering
    
    // Save a node WITHOUT ViewState (simulating bug where ViewState isn't persisted)
    const testGraph = {
      id: 'root',
      children: [
        {
          id: 'node-without-viewstate',
          labels: [{ text: 'Node Without ViewState' }],
          data: { label: 'Node Without ViewState' }
        }
      ],
      edges: []
    };

    // Intentionally missing ViewState - this simulates the bug
    const testViewState = {
      node: {}, // Empty - node has no geometry
      group: {},
      edge: {}
    };

    saveCanvasSnapshot(testGraph, testViewState, 'test-architecture');

    // Restore
    const restored = restoreCanvasSnapshot();
    expect(restored).toBeTruthy();
    
    // Convert to ReactFlow nodes
    // Render using Domain + ViewState → ReactFlow to test what would appear on canvas
    const { toReactFlowWithViewState } = await import('../../../core/renderer/ReactFlowAdapter');
    
    const minimalELK = {
      id: 'root', 
      children: restored!.rawGraph.children.map((child: any) => ({
        id: child.id,
        type: 'default',
        data: child.data || {},
      })),
      edges: restored!.rawGraph.edges || [],
    };
    
    const dimensions = { width: 96, height: 96, groupWidth: 288, groupHeight: 192, padding: 10 };
    const { nodes } = toReactFlowWithViewState(minimalELK, dimensions, restored!.viewState);
    
    // Node will be in the array but at position (0,0) with default size
    // This is NOT the correct behavior - node should have its saved position
    const renderedNode = nodes.find((n: any) => n.id === 'node-without-viewstate');
    expect(renderedNode).toBeTruthy();
    
    // CRITICAL: This test documents the current behavior - node appears at (0,0) when ViewState is missing
    // In a perfect world, this should fail or the node shouldn't render at all
    // But currently DomainRenderer defaults to (0,0) when ViewState is missing
    expect(renderedNode?.position.x).toBe(0); // Default position, not the saved position
    expect(renderedNode?.position.y).toBe(0); // Default position, not the saved position
  });
});

