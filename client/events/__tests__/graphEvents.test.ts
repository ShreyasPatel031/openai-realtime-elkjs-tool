/**
 * Contract tests for the graph event bridge
 * These tests ensure the event system stays connected and working
 */

import { dispatchElkGraph, onElkGraph, ELK_GRAPH_SET } from '../graphEvents';
import { assertRawGraph } from '../graphSchema';
import { RawGraph } from '../../components/graph/types';

describe('Graph Event Bridge Contract Tests', () => {
  let cleanup: (() => void)[] = [];

  afterEach(() => {
    // Clean up all event listeners
    cleanup.forEach(fn => fn());
    cleanup = [];
  });

  const mockGraph: RawGraph = {
    id: 'test-root',
    children: [
      { id: 'node1', data: { label: 'Test Node 1' }, children: [], edges: [] },
      { id: 'node2', data: { label: 'Test Node 2' }, children: [], edges: [] }
    ],
    edges: [
      { id: 'edge1', sources: ['node1'], targets: ['node2'] }
    ]
  };

  test('Event emitter reaches event listener with exact payload', () => {
    const mockHandler = jest.fn();
    
    // Set up listener
    const unsubscribe = onElkGraph(mockHandler);
    cleanup.push(unsubscribe);

    // Emit event
    dispatchElkGraph({
      elkGraph: mockGraph,
      source: 'TestEmitter',
      reason: 'unit-test'
    });

    // Verify handler was called with exact data
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        elkGraph: mockGraph,
        source: 'TestEmitter',
        reason: 'unit-test',
        version: 1,
        ts: expect.any(Number)
      })
    );
  });

  test('Multiple listeners receive the same event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    
    // Set up multiple listeners
    cleanup.push(onElkGraph(handler1));
    cleanup.push(onElkGraph(handler2));

    // Emit one event
    dispatchElkGraph({
      elkGraph: mockGraph,
      source: 'MultiListener',
      reason: 'broadcast-test'
    });

    // Both handlers should receive the same data
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    
    const call1 = handler1.mock.calls[0][0];
    const call2 = handler2.mock.calls[0][0];
    expect(call1).toEqual(call2);
  });

  test('Event listener unsubscribe prevents further events', () => {
    const mockHandler = jest.fn();
    
    // Set up and immediately unsubscribe
    const unsubscribe = onElkGraph(mockHandler);
    unsubscribe();

    // Emit event after unsubscribe
    dispatchElkGraph({
      elkGraph: mockGraph,
      source: 'UnsubscribeTest',
      reason: 'should-not-reach'
    });

    // Handler should not have been called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  test('Event contains metadata with reasonable defaults', () => {
    const mockHandler = jest.fn();
    cleanup.push(onElkGraph(mockHandler));

    const beforeDispatch = Date.now();
    
    // Emit minimal event
    dispatchElkGraph({
      elkGraph: mockGraph
    });

    const afterDispatch = Date.now();
    const eventDetail = mockHandler.mock.calls[0][0];

    // Check defaults are applied
    expect(eventDetail.version).toBe(1);
    expect(eventDetail.ts).toBeGreaterThanOrEqual(beforeDispatch);
    expect(eventDetail.ts).toBeLessThanOrEqual(afterDispatch);
  });

  test('Graph validation catches malformed graphs', () => {
    const malformedGraphs = [
      null,
      undefined,
      'not-an-object',
      { id: 123 }, // id should be string
      { id: 'test' }, // missing children/edges
      { id: 'test', children: 'not-array', edges: [] },
      { id: 'test', children: [], edges: 'not-array' },
      { id: 'test', children: [{ id: 123 }], edges: [] }, // child id should be string
    ];

    malformedGraphs.forEach((malformed, index) => {
      expect(() => {
        assertRawGraph(malformed, `test-case-${index}`);
      }).toThrow();
    });
  });

  test('Graph validation passes for valid graphs', () => {
    const validGraphs = [
      { id: 'root', children: [], edges: [] },
      mockGraph,
      {
        id: 'complex',
        children: [
          { 
            id: 'group1', 
            data: { label: 'Group' },
            children: [
              { id: 'nested', data: {}, children: [], edges: [] }
            ],
            edges: []
          }
        ],
        edges: [
          { id: 'e1', sources: ['group1'], targets: ['nested'] }
        ]
      }
    ];

    validGraphs.forEach(validGraph => {
      expect(() => {
        assertRawGraph(validGraph);
      }).not.toThrow();
    });
  });

  test('Integration: FunctionExecutor pattern works end-to-end', () => {
    // This simulates the exact pattern used in FunctionExecutor
    const mockSetRawGraph = jest.fn();
    
    // Set up canvas listener (like InteractiveCanvas does)
    const unsubscribe = onElkGraph(({ elkGraph }) => {
      mockSetRawGraph(elkGraph);
    });
    cleanup.push(unsubscribe);

    // Simulate FunctionExecutor dispatching (with validation)
    const newGraph = assertRawGraph(mockGraph, 'FunctionExecutor.setElkGraph');
    dispatchElkGraph({
      elkGraph: newGraph,
      source: 'FunctionExecutor',
      reason: 'agent-update'
    });

    // Verify canvas would be updated
    expect(mockSetRawGraph).toHaveBeenCalledTimes(1);
    expect(mockSetRawGraph).toHaveBeenCalledWith(mockGraph);
  });
});

/**
 * Real DOM event system test (beyond jsdom)
 * This ensures our events work in actual browser environment
 */
describe('Graph Events DOM Integration', () => {
  test('Events work with real DOM CustomEvent system', () => {
    const receivedEvents: any[] = [];
    
    // Raw DOM listener
    const rawListener = (e: Event) => {
      receivedEvents.push((e as CustomEvent).detail);
    };
    
    window.addEventListener(ELK_GRAPH_SET, rawListener);
    
    try {
      // Dispatch through our system
      dispatchElkGraph({
        elkGraph: { id: 'dom-test', children: [], edges: [] },
        source: 'DOMTest',
        reason: 'integration-test'
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({
        elkGraph: { id: 'dom-test', children: [], edges: [] },
        source: 'DOMTest',
        reason: 'integration-test'
      });
    } finally {
      window.removeEventListener(ELK_GRAPH_SET, rawListener);
    }
  });
});
