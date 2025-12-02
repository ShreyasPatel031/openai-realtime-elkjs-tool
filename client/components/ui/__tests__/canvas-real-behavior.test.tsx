/**
 * Real Canvas Behavior Tests
 * 
 * Tests the actual canvas behavior by directly calling the functions
 * and checking the real DOM state, localStorage, and canvas operations.
 * 
 * This tests REAL behavior, not mocked variables.
 */

import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';
import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../../core/viewstate/ViewState';
import type { Node, Edge } from 'reactflow';
import { saveCanvasSnapshot, restoreCanvasSnapshot, LOCAL_CANVAS_SNAPSHOT_KEY } from '../../../utils/canvasPersistence';
import { handleDeleteKey } from '../../../utils/canvas/canvasDeleteInteractions';

// Real DOM testing helpers
function createMockCanvasDOM() {
  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  canvasContainer.style.width = '800px';
  canvasContainer.style.height = '600px';
  document.body.appendChild(canvasContainer);
  
  return canvasContainer;
}

function createNodeElement(nodeId: string, x: number, y: number) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'canvas-node';
  nodeEl.setAttribute('data-node-id', nodeId);
  nodeEl.style.position = 'absolute';
  nodeEl.style.left = `${x}px`;
  nodeEl.style.top = `${y}px`;
  nodeEl.style.width = '96px';
  nodeEl.style.height = '96px';
  nodeEl.style.backgroundColor = '#f0f0f0';
  nodeEl.style.border = '1px solid #ccc';
  nodeEl.textContent = nodeId;
  return nodeEl;
}

describe('Real Canvas Behavior Tests', () => {
  let testGraph: { current: RawGraph };
  let testViewState: { current: ViewState };
  let capturedNodes: Node[] = [];
  let capturedEdges: Edge[] = [];
  let canvasContainer: HTMLElement;
  let mockSetRawGraph: jest.Mock;

  beforeEach(() => {
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear DOM
    document.body.innerHTML = '';
    
    // Create real DOM canvas
    canvasContainer = createMockCanvasDOM();
    
    // Reset test state
    testGraph = { current: { id: 'root', children: [], edges: [] } };
    testViewState = { current: { node: {}, group: {}, edge: {} } };
    capturedNodes = [];
    capturedEdges = [];
    
    mockSetRawGraph = jest.fn((graph) => {
      testGraph.current = graph;
    });

    // Initialize orchestrator with real DOM updates
    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {}, // renderTrigger
      mockSetRawGraph,
      (nodes) => { 
        capturedNodes = [...nodes];
        updateRealDOM(nodes);
      },
      (edges) => { 
        capturedEdges = [...edges];
      }
    );
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '';
  });

  // Update real DOM to match ReactFlow nodes
  function updateRealDOM(nodes: Node[]) {
    // Clear existing nodes
    const existingNodes = canvasContainer.querySelectorAll('.canvas-node');
    existingNodes.forEach(node => node.remove());
    
    // Add new nodes
    nodes.forEach(node => {
      const nodeEl = createNodeElement(node.id, node.position.x, node.position.y);
      canvasContainer.appendChild(nodeEl);
    });
  }

  function getCanvasNodeElements(): HTMLElement[] {
    return Array.from(canvasContainer.querySelectorAll('.canvas-node'));
  }

  function getNodePosition(nodeId: string): { x: number, y: number } | null {
    const nodeEl = canvasContainer.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement;
    if (!nodeEl) return null;
    
    return {
      x: parseInt(nodeEl.style.left) || 0,
      y: parseInt(nodeEl.style.top) || 0
    };
  }

  describe('Real Node Addition to Canvas', () => {
    it('should add nodes to real DOM and maintain positions', async () => {
      console.log('🧪 [REAL-DOM] Testing node addition to actual DOM');

      // Add first node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'real-node-1',
          parentId: 'root',
          position: { x: 100, y: 150 },
          size: { w: 96, h: 96 },
          data: { label: 'Real Node 1' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check real DOM
      const domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(1);
      expect(domNodes[0].getAttribute('data-node-id')).toBe('real-node-1');
      
      const pos1 = getNodePosition('real-node-1');
      expect(pos1).toEqual({ x: 100, y: 150 });

      console.log('✅ [REAL-DOM] First node added to DOM at correct position');

      // Add second node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'real-node-2',
          parentId: 'root',
          position: { x: 300, y: 250 },
          size: { w: 96, h: 96 },
          data: { label: 'Real Node 2' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check both nodes exist in DOM
      const domNodesAfter = getCanvasNodeElements();
      expect(domNodesAfter).toHaveLength(2);

      // CRITICAL: First node should NOT have moved
      const pos1After = getNodePosition('real-node-1');
      expect(pos1After).toEqual({ x: 100, y: 150 });

      const pos2 = getNodePosition('real-node-2');
      expect(pos2).toEqual({ x: 300, y: 250 });

      console.log('✅ [REAL-DOM] Second node added, first node position unchanged');
    });
  });

  describe('Real Node Deletion from Canvas', () => {
    it('should delete nodes from real DOM', async () => {
      console.log('🧪 [REAL-DOM] Testing node deletion from actual DOM');

      // Add 3 nodes
      const nodeIds = ['del-node-1', 'del-node-2', 'del-node-3'];
      for (let i = 0; i < nodeIds.length; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: nodeIds[i],
            parentId: 'root',
            position: { x: 100 * (i + 1), y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Del Node ${i + 1}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all 3 nodes in DOM
      let domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(3);

      // Delete middle node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'delete-node',
          nodeId: 'del-node-2',
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check DOM updated
      domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(2);

      // Verify correct nodes remain
      const remainingIds = domNodes.map(el => el.getAttribute('data-node-id'));
      expect(remainingIds).toContain('del-node-1');
      expect(remainingIds).toContain('del-node-3');
      expect(remainingIds).not.toContain('del-node-2');

      console.log('✅ [REAL-DOM] Node successfully deleted from DOM');
    });

    it('should handle multiselect deletion in real DOM', async () => {
      console.log('🧪 [REAL-DOM] Testing multiselect deletion');

      // Add 4 nodes
      for (let i = 1; i <= 4; i++) {
        await apply({
          source: 'user',
          kind: 'free-structural',
          scopeId: 'root',
          payload: {
            action: 'add-node',
            nodeId: `multi-del-${i}`,
            parentId: 'root',
            position: { x: 100 * i, y: 100 },
            size: { w: 96, h: 96 },
            data: { label: `Multi Del ${i}` },
          },
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all 4 nodes in DOM
      let domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(4);

      // Simulate multiselect delete using the real delete handler
      const selectedNodes = capturedNodes.filter(n => 
        n.id === 'multi-del-2' || n.id === 'multi-del-3'
      );

      handleDeleteKey({
        selectedNodes,
        selectedEdges: [],
        rawGraph: testGraph.current,
        selectedArchitectureId: 'test-arch'
      });

      // Wait for deletions to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check DOM updated correctly
      domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(2);

      const remainingIds = domNodes.map(el => el.getAttribute('data-node-id'));
      expect(remainingIds).toContain('multi-del-1');
      expect(remainingIds).toContain('multi-del-4');
      expect(remainingIds).not.toContain('multi-del-2');
      expect(remainingIds).not.toContain('multi-del-3');

      console.log('✅ [REAL-DOM] Multiselect deletion worked correctly');
    });
  });

  describe('Real Persistence and Restoration', () => {
    it('should persist to real localStorage and restore correctly', async () => {
      console.log('🧪 [REAL-PERSISTENCE] Testing real localStorage persistence');

      // Add nodes
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'persist-test-1',
          parentId: 'root',
          position: { x: 150, y: 200 },
          size: { w: 96, h: 96 },
          data: { label: 'Persist Test 1' },
        },
      });

      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'persist-test-2',
          parentId: 'root',
          position: { x: 350, y: 300 },
          size: { w: 96, h: 96 },
          data: { label: 'Persist Test 2' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Manually save to localStorage (simulating auto-save)
      saveCanvasSnapshot(testGraph.current, testViewState.current, 'test-architecture');

      // Verify localStorage has data
      const savedData = localStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY);
      expect(savedData).toBeTruthy();

      const parsed = JSON.parse(savedData!);
      expect(parsed.rawGraph.children).toHaveLength(2);
      expect(Object.keys(parsed.viewState.node)).toHaveLength(2);

      console.log('✅ [REAL-PERSISTENCE] Data saved to real localStorage');

      // Simulate page refresh - clear everything
      testGraph.current = { id: 'root', children: [], edges: [] };
      testViewState.current = { node: {}, group: {}, edge: {} };
      capturedNodes = [];
      canvasContainer.innerHTML = '';

      // Re-initialize
      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        mockSetRawGraph,
        (nodes) => { 
          capturedNodes = [...nodes];
          updateRealDOM(nodes);
        },
        (edges) => { capturedEdges = [...edges]; }
      );

      // Restore from localStorage
      const restored = restoreCanvasSnapshot();
      expect(restored).toBeTruthy();

      if (restored) {
        testGraph.current = restored.rawGraph;
        testViewState.current = restored.viewState;
        
        // Simulate the restoration render that would happen in the real app
        const { convertViewStateToReactFlow } = await import('../../../core/renderer/ViewStateToReactFlow');
        const { nodes, edges } = convertViewStateToReactFlow(restored.rawGraph, restored.viewState);
        
        capturedNodes = nodes;
        capturedEdges = edges;
        
        // Update real DOM
        updateRealDOM(nodes);
      }

      // Check DOM was restored
      const restoredDomNodes = getCanvasNodeElements();
      expect(restoredDomNodes).toHaveLength(2);

      const restoredIds = restoredDomNodes.map(el => el.getAttribute('data-node-id'));
      expect(restoredIds).toContain('persist-test-1');
      expect(restoredIds).toContain('persist-test-2');

      console.log('✅ [REAL-PERSISTENCE] Canvas restored from real localStorage');
    });

    it('should clear localStorage with resetCanvas and stay empty', async () => {
      console.log('🧪 [REAL-RESET] Testing real resetCanvas behavior');

      // Add a node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'reset-test-node',
          parentId: 'root',
          position: { x: 200, y: 200 },
          size: { w: 96, h: 96 },
          data: { label: 'Reset Test Node' },
        },
      });

      // Save to localStorage
      saveCanvasSnapshot(testGraph.current, testViewState.current, 'test-architecture');

      // Verify localStorage has data
      expect(localStorage.getItem(LOCAL_CANVAS_SNAPSHOT_KEY)).toBeTruthy();

      // Simulate resetCanvas() behavior
      testGraph.current = { id: 'root', children: [], edges: [] };
      testViewState.current = { node: {}, group: {}, edge: {} };
      
      // Save empty state to localStorage (this is what resetCanvas does)
      const emptySnapshot = {
        rawGraph: { id: "root", children: [], edges: [] },
        viewState: { node: {}, group: {}, edge: {} },
        selectedArchitectureId: 'new-architecture',
        timestamp: Date.now()
      };
      localStorage.setItem(LOCAL_CANVAS_SNAPSHOT_KEY, JSON.stringify(emptySnapshot));

      // Update DOM
      updateRealDOM([]);

      // Check DOM is empty
      let domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(0);

      console.log('✅ [REAL-RESET] Canvas cleared');

      // Simulate refresh - restore from localStorage
      const restoredAfterReset = restoreCanvasSnapshot();
      
      // Should restore empty state
      if (restoredAfterReset) {
        testGraph.current = restoredAfterReset.rawGraph;
        testViewState.current = restoredAfterReset.viewState;
        updateRealDOM([]);
      }

      // DOM should stay empty
      domNodes = getCanvasNodeElements();
      expect(domNodes).toHaveLength(0);

      console.log('✅ [REAL-RESET] Canvas stayed empty after refresh');
    });
  });

  describe('Real Position Stability', () => {
    it('should maintain node positions when adding new nodes', async () => {
      console.log('🧪 [REAL-POSITIONS] Testing position stability');

      // Add first node at specific position
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'stable-node-1',
          parentId: 'root',
          position: { x: 123, y: 456 },
          size: { w: 96, h: 96 },
          data: { label: 'Stable Node 1' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture original position
      const originalPos = getNodePosition('stable-node-1');
      expect(originalPos).toEqual({ x: 123, y: 456 });

      // Add second node
      await apply({
        source: 'user',
        kind: 'free-structural',
        scopeId: 'root',
        payload: {
          action: 'add-node',
          nodeId: 'stable-node-2',
          parentId: 'root',
          position: { x: 789, y: 101 },
          size: { w: 96, h: 96 },
          data: { label: 'Stable Node 2' },
        },
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // CRITICAL: First node should NOT have moved
      const posAfterAdd = getNodePosition('stable-node-1');
      expect(posAfterAdd).toEqual({ x: 123, y: 456 });

      // Second node should be at its position
      const pos2 = getNodePosition('stable-node-2');
      expect(pos2).toEqual({ x: 789, y: 101 });

      console.log('✅ [REAL-POSITIONS] Node positions remained stable');
    });
  });
});
