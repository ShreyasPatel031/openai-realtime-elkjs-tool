import { apply, initializeOrchestrator } from '../../../core/orchestration/Orchestrator';
import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../../core/viewstate/ViewState';
import type { Node, Edge } from 'reactflow';

describe('Canvas Functionality', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('adds node and appears on canvas', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: Node[] = [];
    let capturedEdges: Edge[] = [];

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {},
      (graph) => { testGraph.current = graph; },
      (nodes) => { capturedNodes = [...nodes]; },
      (edges) => { capturedEdges = [...edges]; }
    );

    // Add a node
    const nodeId = 'test-node-1';
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId,
        parentId: 'root',
        position: { x: 100, y: 100 },
        size: { w: 96, h: 96 },
        data: { label: 'Test Node' },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify node appears on canvas
    expect(capturedNodes.length).toBe(1);
    expect(capturedNodes[0].id).toBe(nodeId);
    expect(testGraph.current.children.length).toBe(1);
    expect(testViewState.current.node[nodeId]).toBeDefined();
  });

  it('node appears at the right place on canvas', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: Node[] = [];

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {},
      (graph) => { testGraph.current = graph; },
      (nodes) => { capturedNodes = [...nodes]; },
      (edges) => {}
    );

    // Calculate expected position (same logic as placeNodeOnCanvas)
    const userClickPosition = { x: 400, y: 300 };
    const NODE_SIZE = 96;
    const GRID_SIZE = 16;
    const snap = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;
    
    const snappedCenter = { x: snap(userClickPosition.x), y: snap(userClickPosition.y) };
    const expectedTopLeft = {
      x: snappedCenter.x - NODE_SIZE / 2,
      y: snappedCenter.y - NODE_SIZE / 2
    };

    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId: 'position-test-node',
        parentId: 'root',
        position: expectedTopLeft,
        size: { w: NODE_SIZE, h: NODE_SIZE },
        data: { label: 'Position Test Node' },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const renderedNode = capturedNodes.find(n => n.id === 'position-test-node');
    expect(renderedNode).toBeDefined();
    expect(renderedNode?.position.x).toBe(expectedTopLeft.x);
    expect(renderedNode?.position.y).toBe(expectedTopLeft.y);
  });

  it('node persists after refresh', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: Node[] = [];

    const mockSetNodes = (nodes: Node[]) => { capturedNodes = [...nodes]; };
    const mockSetEdges = (edges: Edge[]) => { };

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {},
      (graph) => { testGraph.current = graph; },
      mockSetNodes,
      mockSetEdges
    );

    // Add a node BEFORE refresh
    const nodeId = 'persistence-test-node';
    const position = { x: 200, y: 150 };
    
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId,
        parentId: 'root',
        position,
        size: { w: 96, h: 96 },
        data: { label: 'Before Refresh Node' },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Save state to localStorage (simulate real app persistence)
    const canvasPersistence = await import('../../../utils/canvasPersistence');
    const snapshot = {
      rawGraph: testGraph.current,
      viewState: testViewState.current,
      selectedArchitectureId: 'test-architecture',
      timestamp: Date.now()
    };
    localStorage.setItem(canvasPersistence.LOCAL_CANVAS_SNAPSHOT_KEY, JSON.stringify(snapshot));
    
    // === SIMULATE PAGE REFRESH: Clear all React state ===
    testGraph.current = { id: 'root', children: [], edges: [] };
    testViewState.current = { node: {}, group: {}, edge: {} };
    capturedNodes = [];
    
    // Restore from localStorage
    const restored = canvasPersistence.restoreCanvasSnapshot();
    expect(restored).not.toBeNull();

    if (restored) {
      testGraph.current = restored.rawGraph;
      testViewState.current = restored.viewState;
    }

    // Trigger restoration render (simulates setRawGraph call in real app)
    const { triggerRestorationRender } = await import('../../../core/orchestration/Orchestrator');
    const graphWithViewState = { ...testGraph.current, viewState: testViewState.current };
    
    triggerRestorationRender(
      { current: graphWithViewState },
      { current: graphWithViewState.viewState }
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify node persisted and renders after refresh
    expect(testGraph.current.children.length).toBe(1);
    expect(testGraph.current.children[0].id).toBe(nodeId);
    expect(Object.keys(testViewState.current.node).length).toBe(1);
    expect(testViewState.current.node[nodeId]).toBeDefined();
    expect(testViewState.current.node[nodeId].x).toBe(position.x);
    expect(testViewState.current.node[nodeId].y).toBe(position.y);
    
    expect(capturedNodes.length).toBeGreaterThan(0);
    const restoredNode = capturedNodes.find(n => n.id === nodeId);
    expect(restoredNode).toBeDefined();
    expect(restoredNode?.position.x).toBe(position.x);
    expect(restoredNode?.position.y).toBe(position.y);
  });

  it('deletes node from canvas, domain, and does not appear after refresh', async () => {
    const testGraph = { current: { id: 'root', children: [], edges: [] } };
    const testViewState = { current: { node: {}, group: {}, edge: {} } };
    let capturedNodes: Node[] = [];

    const mockSetNodes = (nodes: Node[]) => { capturedNodes = [...nodes]; };
    const mockSetEdges = (edges: Edge[]) => { };

    initializeOrchestrator(
      testGraph,
      testViewState,
      () => {},
      (graph) => { testGraph.current = graph; },
      mockSetNodes,
      mockSetEdges
    );

    // Step 1: Add a node
    const nodeId = 'delete-test-node';
    const position = { x: 150, y: 200 };
    
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId,
        parentId: 'root',
        position,
        size: { w: 96, h: 96 },
        data: { label: 'Node to Delete' },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify node exists before deletion
    expect(capturedNodes.length).toBe(1);
    expect(capturedNodes.find(n => n.id === nodeId)).toBeDefined();
    expect(testGraph.current.children.length).toBe(1);
    expect(testViewState.current.node[nodeId]).toBeDefined();

    // Step 2: Delete the node
    await apply({
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'delete-node',
        nodeId,
      },
    });

    // Wait for async rendering to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify deletion from canvas (rendered nodes)
    expect(capturedNodes.length).toBe(0);
    expect(capturedNodes.find(n => n.id === nodeId)).toBeUndefined();

    // Verify deletion from domain (graph structure)
    expect(testGraph.current.children.length).toBe(0);
    expect(testGraph.current.children.find((c: any) => c.id === nodeId)).toBeUndefined();

    // Verify deletion from ViewState
    expect(testViewState.current.node[nodeId]).toBeUndefined();
    expect(Object.keys(testViewState.current.node).length).toBe(0);

    // Step 3: Save state after deletion (the empty state)
    const canvasPersistence = await import('../../../utils/canvasPersistence');
    
    // Re-read graph state after deletion completes (might have been updated)
    const graphAfterDeletion = testGraph.current;
    const viewStateAfterDeletion = testViewState.current;
    
    const snapshot = {
      rawGraph: graphAfterDeletion,
      viewState: viewStateAfterDeletion,
      selectedArchitectureId: 'test-architecture',
      timestamp: Date.now()
    };
    localStorage.setItem(canvasPersistence.LOCAL_CANVAS_SNAPSHOT_KEY, JSON.stringify(snapshot));

    // Step 4: Simulate page refresh
    testGraph.current = { id: 'root', children: [], edges: [] };
    testViewState.current = { node: {}, group: {}, edge: {} };
    capturedNodes = [];

    // Manually restore from localStorage (restoreCanvasSnapshot rejects empty graphs)
    const stored = localStorage.getItem(canvasPersistence.LOCAL_CANVAS_SNAPSHOT_KEY);
    expect(stored).not.toBeNull();
    
    if (stored) {
      const restored = JSON.parse(stored);
      expect(restored).not.toBeNull();
      expect(restored.rawGraph).toBeDefined();
      expect(restored.viewState).toBeDefined();
      
      testGraph.current = restored.rawGraph;
      testViewState.current = restored.viewState;
      
      // Verify the saved state is empty (node was deleted)
      expect(testGraph.current.children.length).toBe(0);
      expect(Object.keys(testViewState.current.node).length).toBe(0);
      
      // Re-initialize orchestrator with restored empty state
      initializeOrchestrator(
        testGraph,
        testViewState,
        () => {},
        (graph) => { testGraph.current = graph; },
        mockSetNodes,
        mockSetEdges
      );

      // Trigger restoration render
      const { triggerRestorationRender } = await import('../../../core/orchestration/Orchestrator');
      const graphWithViewState = { ...testGraph.current, viewState: testViewState.current };
      
      triggerRestorationRender(
        { current: graphWithViewState },
        { current: graphWithViewState.viewState }
      );

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Step 5: Verify deleted node does NOT appear after refresh
    expect(testGraph.current.children.length).toBe(0);
    expect(Object.keys(testViewState.current.node).length).toBe(0);
    expect(capturedNodes.length).toBe(0);
    expect(capturedNodes.find(n => n.id === nodeId)).toBeUndefined();
  });
});
