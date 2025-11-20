/**
 * Test for Orchestrator add-node functionality
 * 
 * This test verifies that when a node is added at a specific position,
 * it appears at that exact position in the rendered output.
 */

import { apply, initializeOrchestrator } from '../Orchestrator';
import type { EditIntent } from '../types';
import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../viewstate/ViewState';
// Domain → ViewState → ReactFlow architecture - no direct Domain → ReactFlow rendering

describe('Orchestrator add-node position', () => {
  let graphRef: { current: RawGraph | null };
  let viewStateRef: { current: ViewState };
  let nodes: any[] = [];
  let edges: any[] = [];

  beforeEach(() => {
    // Initialize with empty graph
    graphRef = {
      current: {
        id: 'root',
        children: [],
        edges: [],
      },
    };

    viewStateRef = {
      current: {
        node: {},
        group: {},
        edge: {},
      },
    };

    nodes = [];
    edges = [];

    // Initialize orchestrator
    initializeOrchestrator(
      graphRef,
      viewStateRef,
      () => {}, // renderTrigger
      (graph) => {
        graphRef.current = graph;
      },
      (newNodes) => {
        nodes = newNodes;
      },
      (newEdges) => {
        edges = newEdges;
      }
    );
  });

  it('should add node at exact position specified', async () => {
    const testPosition = { x: 256, y: 448 };
    const testSize = { w: 96, h: 96 };
    const nodeId = 'test-node-123';

    const intent: EditIntent = {
      source: 'user',
      kind: 'free-structural',
      scopeId: 'root',
      payload: {
        action: 'add-node',
        nodeId,
        parentId: 'root',
        position: testPosition,
        size: testSize,
        data: {
          label: 'Test Node',
        },
      },
    };

    // Apply the edit
    await apply(intent);

    // Verify node was added to graph
    expect(graphRef.current).toBeTruthy();
    expect(graphRef.current?.children).toBeTruthy();
    const addedNode = graphRef.current?.children?.find((n: any) => n.id === nodeId);
    expect(addedNode).toBeTruthy();

    // Verify position was written to ViewState
    const viewStateGeometry = viewStateRef.current.node?.[nodeId];
    expect(viewStateGeometry).toBeTruthy();
    expect(viewStateGeometry?.x).toBe(testPosition.x);
    expect(viewStateGeometry?.y).toBe(testPosition.y);
    expect(viewStateGeometry?.w).toBe(testSize.w);
    expect(viewStateGeometry?.h).toBe(testSize.h);

    // Verify node appears in rendered output at correct position
    expect(nodes.length).toBeGreaterThan(0);
    const renderedNode = nodes.find((n) => n.id === nodeId);
    expect(renderedNode).toBeTruthy();
    expect(renderedNode?.position).toEqual(testPosition);
  });

  it('should render node at correct position using DomainRenderer', () => {
    // Manually set up graph and ViewState
    graphRef.current = {
      id: 'root',
      children: [
        {
          id: 'test-node-456',
          labels: [{ text: 'Test' }],
          data: {},
        },
      ],
      edges: [],
    };

    viewStateRef.current = {
      node: {
        'test-node-456': { x: 100, y: 200, w: 96, h: 96 },
      },
      group: {},
      edge: {},
    };

    // Render using DomainRenderer
    // TODO: Update test to use ViewState → ReactFlow architecture
    // const { nodes: renderedNodes } = toReactFlowWithViewState(minimalELK, dimensions, viewStateRef.current);
    const renderedNodes: any[] = []; // Temporarily disabled

    expect(renderedNodes.length).toBe(1);
    expect(renderedNodes[0].id).toBe('test-node-456');
    expect(renderedNodes[0].position).toEqual({ x: 100, y: 200 });
  });
});

