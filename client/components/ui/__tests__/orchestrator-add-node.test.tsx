/**
 * Test for complete Orchestrator add-node flow
 */

import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';

describe('Orchestrator add-node flow', () => {
  it('should add node via Orchestrator and render on canvas', async () => {
    // Test environment - fresh refs
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let testNodes: any[] = [];
    let testEdges: any[] = [];
    
    // Mock render trigger that actually converts Domain + ViewState → ReactFlow
    const mockRender = async () => {
      const { toReactFlowWithViewState } = await import('../../../core/renderer/ReactFlowAdapter');
      const elkStructure = {
        id: 'root',
        children: testGraph.current?.children?.map((child: any) => ({
          id: child.id,
          type: 'default',
          data: child.data || {},
        })) || [],
        edges: testGraph.current?.edges || [],
      };
      const dimensions = { width: 96, height: 96, groupWidth: 288, groupHeight: 192, padding: 10 };
      const result = toReactFlowWithViewState(elkStructure, dimensions, testViewState.current, { strictGeometry: false });
      testNodes = result.nodes;
      testEdges = result.edges;
    };
    
    // Initialize Orchestrator
    initializeOrchestrator(
      testGraph,
      testViewState,
      mockRender,
      (graph) => { testGraph.current = graph; },
      (nodes) => { testNodes = nodes; },
      (edges) => { testEdges = edges; }
    );
    
    // Apply add-node intent
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId: 'test-node-123',
        parentId: 'root',
        position: { x: 200, y: 300 },
        size: { w: 96, h: 96 },
        data: { label: 'Test Node' },
      },
    });
    
    // Wait for async rendering to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Domain updated
    expect(testGraph.current.children.length).toBe(1);
    expect(testGraph.current.children[0].id).toBe('test-node-123');
    
    // Verify ViewState updated
    expect(testViewState.current.node['test-node-123']).toBeTruthy();
    expect(testViewState.current.node['test-node-123'].x).toBe(200);
    expect(testViewState.current.node['test-node-123'].y).toBe(300);
    
    // Verify ReactFlow render - NODE APPEARS ON CANVAS
    expect(testNodes.length).toBe(1);
    expect(testNodes[0].id).toBe('test-node-123');
    expect(testNodes[0].position.x).toBe(200);
    expect(testNodes[0].position.y).toBe(300);
  });
});
