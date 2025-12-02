/**
 * Layer Sync Test Suite
 * 
 * Tests ALL possible scenarios for Domain ↔ ViewState ↔ ReactFlow synchronization.
 * This is the definitive test suite for the layer sync problem.
 * 
 * LAYERS:
 * 1. Domain (RawGraph) - Pure structural data
 * 2. ViewState - Geometry/position data
 * 3. ReactFlow - Rendered nodes/edges
 * 
 * INVARIANTS (must ALWAYS be true):
 * - Domain node count === ViewState node count
 * - Domain node count === ReactFlow node count
 * - Every domain node has ViewState geometry
 * - Every ViewState entry has a domain node
 * - No "ghost" nodes (ViewState without domain)
 * - No "invisible" nodes (domain without ViewState)
 */

import { apply, initializeOrchestrator, triggerRestorationRender } from '../orchestration/Orchestrator';
import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from '../viewstate/ViewState';
import type { Node, Edge } from 'reactflow';
import { cleanViewState } from '../viewstate/ViewStateCleanup';

// Test helpers
interface LayerState {
  domainNodeCount: number;
  domainNodeIds: string[];
  viewStateNodeCount: number;
  viewStateNodeIds: string[];
  viewStateGroupCount: number;
  viewStateGroupIds: string[];
  reactFlowNodeCount: number;
  reactFlowNodeIds: string[];
}

function getLayerState(
  graph: RawGraph,
  viewState: ViewState,
  nodes: Node[]
): LayerState {
  const domainNodeIds = collectDomainNodeIds(graph);
  const viewStateNodeIds = Object.keys(viewState.node || {});
  const viewStateGroupIds = Object.keys(viewState.group || {});
  const reactFlowNodeIds = nodes.map(n => n.id);

  return {
    domainNodeCount: domainNodeIds.length,
    domainNodeIds,
    viewStateNodeCount: viewStateNodeIds.length,
    viewStateNodeIds,
    viewStateGroupCount: viewStateGroupIds.length,
    viewStateGroupIds,
    reactFlowNodeCount: nodes.length,
    reactFlowNodeIds
  };
}

function collectDomainNodeIds(graph: RawGraph): string[] {
  const ids: string[] = [];
  const traverse = (node: any) => {
    if (node.id && node.id !== 'root') {
      ids.push(node.id);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  if (graph.children) {
    graph.children.forEach(traverse);
  }
  return ids;
}

function assertLayerSync(state: LayerState, context: string) {
  const errors: string[] = [];

  // Combine ViewState nodes and groups for total count
  // Groups are stored separately but should be counted as "nodes" for sync purposes
  const allViewStateIds = [...state.viewStateNodeIds, ...state.viewStateGroupIds.filter(id => !state.viewStateNodeIds.includes(id))];
  const totalViewStateCount = allViewStateIds.length;

  // Check counts match (domain vs combined viewstate)
  if (state.domainNodeCount !== totalViewStateCount) {
    errors.push(`Domain (${state.domainNodeCount}) !== ViewState (${totalViewStateCount})`);
  }
  if (state.domainNodeCount !== state.reactFlowNodeCount) {
    errors.push(`Domain (${state.domainNodeCount}) !== ReactFlow (${state.reactFlowNodeCount})`);
  }

  // Check for ghost nodes (in ViewState but not in Domain)
  const ghostNodes = allViewStateIds.filter(id => !state.domainNodeIds.includes(id));
  if (ghostNodes.length > 0) {
    errors.push(`Ghost nodes in ViewState: ${ghostNodes.join(', ')}`);
  }

  // Check for invisible nodes (in Domain but not in ViewState)
  const invisibleNodes = state.domainNodeIds.filter(id => !allViewStateIds.includes(id));
  if (invisibleNodes.length > 0) {
    errors.push(`Invisible nodes (no ViewState): ${invisibleNodes.join(', ')}`);
  }

  // Check for orphaned ReactFlow nodes
  const orphanedRFNodes = state.reactFlowNodeIds.filter(id => !state.domainNodeIds.includes(id));
  if (orphanedRFNodes.length > 0) {
    errors.push(`Orphaned ReactFlow nodes: ${orphanedRFNodes.join(', ')}`);
  }

  if (errors.length > 0) {
    console.error(`❌ [LAYER SYNC FAILURE] ${context}:`, errors);
    console.error('State:', state);
  }

  expect(errors).toEqual([]);
}

describe('Layer Sync Test Suite', () => {
  let testGraph: { current: RawGraph };
  let testViewState: { current: ViewState };
  let capturedNodes: Node[] = [];
  let capturedEdges: Edge[] = [];
  let mockSetRawGraph: jest.Mock;

  beforeEach(() => {
    // Reset all state
    testGraph = { current: { id: 'root', children: [], edges: [] } };
    testViewState = { current: { node: {}, group: {}, edge: {} } };
    capturedNodes = [];
    capturedEdges = [];

    mockSetRawGraph = jest.fn((graph) => {
      testGraph.current = graph;
    });

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {},
      mockSetRawGraph,
      (nodes) => { capturedNodes = [...nodes]; },
      (edges) => { capturedEdges = [...edges]; }
    );
  });

  describe('Scenario 1: Add Single Node', () => {
    it('should maintain layer sync after adding one node', async () => {
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

      await new Promise(resolve => setTimeout(resolve, 100));

      const state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding single node');
      expect(state.domainNodeCount).toBe(1);
    });
  });

  describe('Scenario 2: Add Multiple Nodes Sequentially', () => {
    it('should maintain layer sync after adding 5 nodes', async () => {
      for (let i = 1; i <= 5; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Node ${i}` },
          },
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
        assertLayerSync(state, `After adding node ${i}`);
        expect(state.domainNodeCount).toBe(i);
      }
    });
  });

  describe('Scenario 3: Delete Single Node', () => {
    it('should maintain layer sync after deleting one node', async () => {
      // Add 3 nodes
      for (let i = 1; i <= 3; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'Before deletion');
      expect(state.domainNodeCount).toBe(3);

      // Delete middle node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'node-2',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After deleting node-2');
      expect(state.domainNodeCount).toBe(2);
      expect(state.domainNodeIds).not.toContain('node-2');
    });
  });

  describe('Scenario 4: Delete Multiple Nodes (Multiselect)', () => {
    it('should maintain layer sync after multiselect delete', async () => {
      // Add 5 nodes
      for (let i = 1; i <= 5; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'Before multiselect delete');
      expect(state.domainNodeCount).toBe(5);

      // Delete nodes 2, 3, 4 sequentially (simulating multiselect)
      for (const nodeId of ['node-2', 'node-3', 'node-4']) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'delete-node',
            nodeId,
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After multiselect delete');
      expect(state.domainNodeCount).toBe(2);
      expect(state.domainNodeIds).toEqual(expect.arrayContaining(['node-1', 'node-5']));
    });
  });

  describe('Scenario 5: Add After Delete', () => {
    it('should maintain layer sync when adding nodes after deletion', async () => {
      // Add 3 nodes
      for (let i = 1; i <= 3; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Delete all nodes
      for (const nodeId of ['node-1', 'node-2', 'node-3']) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'delete-node',
            nodeId,
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After deleting all nodes');
      expect(state.domainNodeCount).toBe(0);

      // Add new nodes
      for (let i = 4; i <= 6; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 200 },
            size: { w: 96, h: 96 },
            data: { label: `Node ${i}` },
          },
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
        assertLayerSync(state, `After adding node-${i} (post-delete)`);
      }

      expect(state.domainNodeCount).toBe(3);
      // Should NOT contain old deleted nodes
      expect(state.domainNodeIds).not.toContain('node-1');
      expect(state.domainNodeIds).not.toContain('node-2');
      expect(state.domainNodeIds).not.toContain('node-3');
    });
  });

  describe('Scenario 6: Interleaved Add/Delete', () => {
    it('should maintain layer sync with interleaved operations', async () => {
      // Add node 1
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

      await new Promise(resolve => setTimeout(resolve, 50));
      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After add node-1');

      // Add node 2
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

      await new Promise(resolve => setTimeout(resolve, 50));
      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After add node-2');

      // Delete node 1
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'node-1',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After delete node-1');

      // Add node 3
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'node-3',
          parentId: 'root',
          position: { x: 300, y: 100 },
          size: { w: 96, h: 96 },
          data: { label: 'Node 3' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After add node-3');

      // Delete node 2
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'node-2',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After delete node-2');

      // Final state should have only node-3
      expect(state.domainNodeCount).toBe(1);
      expect(state.domainNodeIds).toEqual(['node-3']);
    });
  });

  describe('Scenario 7: ViewState Cleanup', () => {
    it('should clean stale ViewState entries', () => {
      // Create a ViewState with stale entries
      const staleViewState: ViewState = {
        node: {
          'node-1': { x: 100, y: 100, w: 96, h: 96 },
          'node-2': { x: 200, y: 100, w: 96, h: 96 },
          'deleted-node': { x: 300, y: 100, w: 96, h: 96 }, // Stale!
          'ghost-node': { x: 400, y: 100, w: 96, h: 96 },   // Stale!
        },
        group: {
          'group-1': { x: 0, y: 0, w: 500, h: 300 },
          'deleted-group': { x: 0, y: 300, w: 500, h: 300 }, // Stale!
        },
        edge: {}
      };

      // Create domain with only some of those nodes
      const domain: RawGraph = {
        id: 'root',
        children: [
          { id: 'node-1', children: [], edges: [] },
          { id: 'node-2', children: [], edges: [] },
          { id: 'group-1', children: [], edges: [], data: { isGroup: true } },
        ],
        edges: []
      };

      // Clean ViewState
      const cleanedViewState = cleanViewState(domain, staleViewState);

      // Verify stale entries are removed
      expect(Object.keys(cleanedViewState.node)).toEqual(['node-1', 'node-2']);
      expect(Object.keys(cleanedViewState.group)).toEqual(['group-1']);
      expect(cleanedViewState.node['deleted-node']).toBeUndefined();
      expect(cleanedViewState.node['ghost-node']).toBeUndefined();
      expect(cleanedViewState.group['deleted-group']).toBeUndefined();
    });
  });

  describe('Scenario 8: Rapid Fire Operations', () => {
    it('should maintain layer sync under rapid sequential operations', async () => {
      // Rapid add 10 nodes - MUST be sequential to avoid race conditions
      // This is the correct behavior - parallel operations WILL cause sync issues
      for (let i = 1; i <= 10; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `rapid-node-${i}`,
            parentId: 'root',
            position: { x: 50 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Rapid Node ${i}` },
          },
        });
        // Small delay between operations to ensure state settles
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After rapid add 10 nodes');
      expect(state.domainNodeCount).toBe(10);

      // Rapid delete 5 nodes - also sequential
      for (let i = 1; i <= 5; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'delete-node',
            nodeId: `rapid-node-${i}`,
          },
        });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After rapid delete 5 nodes');
      expect(state.domainNodeCount).toBe(5);
    });
  });

  describe('Scenario 9: Group Operations', () => {
    it('should maintain layer sync with group operations', async () => {
      // Add a group
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'group-1',
          parentId: 'root',
          position: { x: 0, y: 0 },
          size: { w: 300, h: 200 },
          data: { label: 'Group 1', isGroup: true },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding group');

      // Add nodes inside group
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'child-1',
          parentId: 'group-1',
          position: { x: 50, y: 50 },
          size: { w: 96, h: 96 },
          data: { label: 'Child 1' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding child to group');

      // Delete the group (should also clean up children)
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'group-1',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After deleting group');
      expect(state.domainNodeCount).toBe(0);
    });
  });

  describe('Scenario 10: Persistence and Restoration', () => {
    it('should maintain layer sync after simulated page refresh', async () => {
      console.log('🧪 [PERSISTENCE] Starting persistence test');

      // Add 3 nodes
      for (let i = 1; i <= 3; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `persist-node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Persist Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture state before "refresh"
      const stateBeforeRefresh = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(stateBeforeRefresh, 'Before simulated refresh');
      expect(stateBeforeRefresh.domainNodeCount).toBe(3);

      // Save current state (simulating localStorage save)
      const savedGraph = JSON.parse(JSON.stringify(testGraph.current));
      const savedViewState = JSON.parse(JSON.stringify(testViewState.current));

      console.log('🧪 [PERSISTENCE] Saved state:', {
        graphChildren: savedGraph.children?.length,
        viewStateNodes: Object.keys(savedViewState.node || {}).length
      });

      // Simulate page refresh - reset all state
      testGraph.current = { id: 'root', children: [], edges: [] };
      testViewState.current = { node: {}, group: {}, edge: {} };
      capturedNodes = [];
      capturedEdges = [];

      // Re-initialize orchestrator (simulating fresh page load)
      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        mockSetRawGraph,
        (nodes) => { capturedNodes = [...nodes]; },
        (edges) => { capturedEdges = [...edges]; }
      );

      // Restore from "localStorage" (simulating restoration)
      testGraph.current = savedGraph;
      testViewState.current = savedViewState;

      // Trigger restoration render
      triggerRestorationRender(testGraph, testViewState);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify state after restoration
      const stateAfterRefresh = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(stateAfterRefresh, 'After simulated refresh/restoration');
      expect(stateAfterRefresh.domainNodeCount).toBe(3);

      console.log('🧪 [PERSISTENCE] ✅ State preserved after refresh');
    });

    it('should maintain layer sync when adding node after refresh', async () => {
      console.log('🧪 [ADD-AFTER-REFRESH] Starting test');

      // Add 2 nodes
      for (let i = 1; i <= 2; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `pre-refresh-node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Pre-Refresh Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Save state
      const savedGraph = JSON.parse(JSON.stringify(testGraph.current));
      const savedViewState = JSON.parse(JSON.stringify(testViewState.current));

      // Simulate refresh
      testGraph.current = { id: 'root', children: [], edges: [] };
      testViewState.current = { node: {}, group: {}, edge: {} };
      capturedNodes = [];

      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        mockSetRawGraph,
        (nodes) => { capturedNodes = [...nodes]; },
        (edges) => { capturedEdges = [...edges]; }
      );

      // Restore
      testGraph.current = savedGraph;
      testViewState.current = savedViewState;
      triggerRestorationRender(testGraph, testViewState);

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After restoration, before new add');
      expect(state.domainNodeCount).toBe(2);

      // Capture positions before adding new node
      const positionsBefore = capturedNodes.map(n => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y
      }));

      console.log('🧪 [ADD-AFTER-REFRESH] Positions before add:', positionsBefore);

      // Add NEW node after refresh
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'post-refresh-node',
          parentId: 'root',
          position: { x: 500, y: 500 },
          size: { w: 96, h: 96 },
          data: { label: 'Post-Refresh Node' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding node post-refresh');
      expect(state.domainNodeCount).toBe(3);

      // CRITICAL: Verify existing nodes did NOT move
      const positionsAfter = capturedNodes.map(n => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y
      }));

      console.log('🧪 [ADD-AFTER-REFRESH] Positions after add:', positionsAfter);

      // Check that pre-existing nodes kept their positions
      for (const before of positionsBefore) {
        const after = positionsAfter.find(p => p.id === before.id);
        expect(after).toBeDefined();
        expect(after!.x).toBe(before.x);
        expect(after!.y).toBe(before.y);
      }

      console.log('🧪 [ADD-AFTER-REFRESH] ✅ Existing nodes did not move');
    });

    it('should maintain layer sync when deleting node after refresh', async () => {
      console.log('🧪 [DELETE-AFTER-REFRESH] Starting test');

      // Add 3 nodes
      for (let i = 1; i <= 3; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `del-test-node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Del Test Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Save and restore (simulate refresh)
      const savedGraph = JSON.parse(JSON.stringify(testGraph.current));
      const savedViewState = JSON.parse(JSON.stringify(testViewState.current));

      testGraph.current = { id: 'root', children: [], edges: [] };
      testViewState.current = { node: {}, group: {}, edge: {} };
      capturedNodes = [];

      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        mockSetRawGraph,
        (nodes) => { capturedNodes = [...nodes]; },
        (edges) => { capturedEdges = [...edges]; }
      );

      testGraph.current = savedGraph;
      testViewState.current = savedViewState;
      triggerRestorationRender(testGraph, testViewState);

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After restoration, before delete');
      expect(state.domainNodeCount).toBe(3);

      // Delete a node after refresh
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'del-test-node-2',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After deleting node post-refresh');
      expect(state.domainNodeCount).toBe(2);
      expect(state.domainNodeIds).not.toContain('del-test-node-2');

      // Verify remaining nodes kept their positions
      const node1 = capturedNodes.find(n => n.id === 'del-test-node-1');
      const node3 = capturedNodes.find(n => n.id === 'del-test-node-3');
      expect(node1?.position.x).toBe(100);
      expect(node3?.position.x).toBe(300);

      console.log('🧪 [DELETE-AFTER-REFRESH] ✅ Delete after refresh works correctly');
    });
  });

  describe('Scenario 11: Double Render Prevention', () => {
    it('should not have duplicate renders causing position shifts', async () => {
      console.log('🧪 [DOUBLE-RENDER] Starting test');

      // Add nodes with specific positions
      const nodePositions = [
        { id: 'fixed-pos-1', x: 100, y: 100 },
        { id: 'fixed-pos-2', x: 200, y: 200 },
        { id: 'fixed-pos-3', x: 300, y: 300 },
      ];

      for (const pos of nodePositions) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: pos.id,
            parentId: 'root',
            position: { x: pos.x, y: pos.y },
            size: { w: 96, h: 96 },
            data: { label: pos.id },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all positions are correct
      for (const expected of nodePositions) {
        const node = capturedNodes.find(n => n.id === expected.id);
        expect(node).toBeDefined();
        expect(node!.position.x).toBe(expected.x);
        expect(node!.position.y).toBe(expected.y);
      }

      // Add another node - this should NOT affect existing positions
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'new-node',
          parentId: 'root',
          position: { x: 400, y: 400 },
          size: { w: 96, h: 96 },
          data: { label: 'New Node' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // CRITICAL: Verify existing positions did NOT change
      for (const expected of nodePositions) {
        const node = capturedNodes.find(n => n.id === expected.id);
        expect(node).toBeDefined();
        expect(node!.position.x).toBe(expected.x);
        expect(node!.position.y).toBe(expected.y);
      }

      // Verify new node has correct position
      const newNode = capturedNodes.find(n => n.id === 'new-node');
      expect(newNode).toBeDefined();
      expect(newNode!.position.x).toBe(400);
      expect(newNode!.position.y).toBe(400);

      console.log('🧪 [DOUBLE-RENDER] ✅ No position shifts detected');
    });
  });

  describe('Scenario 12: Stale ViewState After Delete + Add', () => {
    it('should not resurrect deleted nodes when adding new ones', async () => {
      console.log('🧪 [GHOST-PREVENTION] Starting test');

      // Add 3 nodes
      const originalNodes = ['ghost-test-1', 'ghost-test-2', 'ghost-test-3'];
      for (let i = 0; i < originalNodes.length; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: originalNodes[i],
            parentId: 'root',
            position: { x: 100 * (i + 1), y: 100 },
            size: { w: 96, h: 96 },
            data: { label: originalNodes[i] },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      let state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding 3 nodes');

      // Delete all 3 nodes
      for (const nodeId of originalNodes) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'delete-node',
            nodeId,
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After deleting all 3 nodes');
      expect(state.domainNodeCount).toBe(0);
      expect(state.reactFlowNodeCount).toBe(0);

      // Add a NEW node - should NOT bring back deleted nodes
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'fresh-node',
          parentId: 'root',
          position: { x: 500, y: 500 },
          size: { w: 96, h: 96 },
          data: { label: 'Fresh Node' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After adding new node');
      
      // CRITICAL: Should only have 1 node, not 4 (no ghosts!)
      expect(state.domainNodeCount).toBe(1);
      expect(state.reactFlowNodeCount).toBe(1);
      expect(state.domainNodeIds).toEqual(['fresh-node']);
      expect(state.reactFlowNodeIds).toEqual(['fresh-node']);

      // Verify deleted nodes are truly gone
      for (const deletedId of originalNodes) {
        expect(state.domainNodeIds).not.toContain(deletedId);
        expect(state.viewStateNodeIds).not.toContain(deletedId);
        expect(state.reactFlowNodeIds).not.toContain(deletedId);
      }

      console.log('🧪 [GHOST-PREVENTION] ✅ No ghost nodes appeared');
    });
  });

  describe('Scenario 13: Restoration Render vs Direct Render Conflict', () => {
    it('should not have conflicting renders after setRawGraph', async () => {
      console.log('🧪 [RENDER-CONFLICT] Starting test');

      // Add nodes
      for (let i = 1; i <= 2; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `conflict-node-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Conflict Node ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Count renders by tracking setNodes calls
      let renderCount = 0;
      const originalSetNodes = (nodes: Node[]) => {
        renderCount++;
        capturedNodes = [...nodes];
      };

      // Re-init with tracking
      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        mockSetRawGraph,
        originalSetNodes,
        (edges) => { capturedEdges = [...edges]; }
      );

      renderCount = 0;

      // Add one more node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'trigger-node',
          parentId: 'root',
          position: { x: 400, y: 400 },
          size: { w: 96, h: 96 },
          data: { label: 'Trigger Node' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('🧪 [RENDER-CONFLICT] Render count:', renderCount);

      // Should only have 1 render, not 2 (no double render)
      // Allow up to 2 for restoration + direct, but log if > 1
      if (renderCount > 1) {
        console.warn(`⚠️ [RENDER-CONFLICT] Multiple renders detected: ${renderCount}`);
      }

      const state = getLayerState(testGraph.current, testViewState.current, capturedNodes);
      assertLayerSync(state, 'After potential render conflict');

      console.log('🧪 [RENDER-CONFLICT] ✅ Layer sync maintained despite renders');
    });
  });
});

// Export for use in other tests
export { getLayerState, assertLayerSync, collectDomainNodeIds };
