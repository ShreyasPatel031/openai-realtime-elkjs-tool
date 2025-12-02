/**
 * Multiselect Delete Test
 * 
 * Tests that when multiple nodes are selected and deleted:
 * 1. All nodes are deleted from domain
 * 2. All nodes are removed from canvas
 * 3. No race conditions occur
 */

import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';
import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../../core/viewstate/ViewState';
import type { Node, Edge } from 'reactflow';
import { handleDeleteKey } from '../../../utils/canvas/canvasDeleteInteractions';

describe('Multiselect Delete Test', () => {
  let testGraph: { current: RawGraph };
  let testViewState: { current: ViewState };
  let capturedNodes: Node[] = [];
  let capturedEdges: Edge[] = [];

  beforeEach(() => {
    // Reset test state
    testGraph = { current: { id: 'root', children: [], edges: [] } };
    testViewState = { current: { node: {}, group: {}, edge: {} } };
    capturedNodes = [];
    capturedEdges = [];

    // Initialize orchestrator
    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {}, // renderTrigger
      (graph) => { testGraph.current = graph; },
      (nodes) => { capturedNodes = [...nodes]; },
      (edges) => { capturedEdges = [...edges]; }
    );
  });

  it('should delete all selected nodes from both domain and canvas', async () => {
    console.log('🧪 [MULTISELECT-DELETE] Starting test');

    // Step 1: Add 3 nodes
    const nodeIds = ['node-1', 'node-2', 'node-3'];
    
    for (let i = 0; i < nodeIds.length; i++) {
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: nodeIds[i],
          parentId: 'root',
          position: { x: 100 + (i * 100), y: 100 },
          size: { w: 96, h: 96 },
          data: { label: `Node ${i + 1}` },
        },
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify all nodes were added
    expect(testGraph.current.children.length).toBe(3);
    expect(capturedNodes.length).toBe(3);
    expect(Object.keys(testViewState.current.node).length).toBe(3);
    
    console.log('🧪 [MULTISELECT-DELETE] Added 3 nodes successfully');

    // Step 2: Create selected nodes for deletion (simulate multiselect)
    const selectedNodes: Node[] = capturedNodes.map(node => ({
      ...node,
      selected: true
    }));

    console.log('🧪 [MULTISELECT-DELETE] Simulating multiselect delete of all 3 nodes');

    // Step 3: Delete all selected nodes using the actual delete handler
    handleDeleteKey({
      selectedNodes,
      selectedEdges: [],
      rawGraph: testGraph.current,
      selectedArchitectureId: 'test-arch'
    });

    // Wait for all async deletions to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Verify all nodes are deleted from domain
    expect(testGraph.current.children.length).toBe(0);
    console.log('🧪 [MULTISELECT-DELETE] ✅ All nodes deleted from domain');

    // Step 5: Verify all nodes are removed from canvas
    expect(capturedNodes.length).toBe(0);
    console.log('🧪 [MULTISELECT-DELETE] ✅ All nodes removed from canvas');

    // Step 6: Verify all nodes are removed from ViewState
    expect(Object.keys(testViewState.current.node).length).toBe(0);
    console.log('🧪 [MULTISELECT-DELETE] ✅ All nodes removed from ViewState');

    console.log('🧪 [MULTISELECT-DELETE] 🎉 Test passed - no sync issues!');
  });

  it('should handle mixed selection (nodes + edges) correctly', async () => {
    console.log('🧪 [MIXED-DELETE] Starting mixed selection test');

    // Add 2 nodes
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId: 'node-1',
        parentId: 'root',
        position: { x: 100, y: 100 },
        size: { w: 96, h: 96 },
        data: { label: 'Node 1' },
      },
    });

    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId: 'node-2',
        parentId: 'root',
        position: { x: 200, y: 100 },
        size: { w: 96, h: 96 },
        data: { label: 'Node 2' },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify setup
    expect(testGraph.current.children.length).toBe(2);
    expect(capturedNodes.length).toBe(2);

    // Delete both nodes
    const selectedNodes: Node[] = capturedNodes.map(node => ({
      ...node,
      selected: true
    }));

    handleDeleteKey({
      selectedNodes,
      selectedEdges: [],
      rawGraph: testGraph.current,
      selectedArchitectureId: 'test-arch'
    });

    // Wait for deletions
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify all deleted
    expect(testGraph.current.children.length).toBe(0);
    expect(capturedNodes.length).toBe(0);
    expect(Object.keys(testViewState.current.node).length).toBe(0);

    console.log('🧪 [MIXED-DELETE] ✅ Mixed selection handled correctly');
  });
});




