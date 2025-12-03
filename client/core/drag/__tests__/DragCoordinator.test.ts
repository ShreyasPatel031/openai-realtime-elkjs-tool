/**
 * DragCoordinator Tests
 * 
 * Tests verify:
 * 1. State synchronization (ViewState, Domain, refs stay in sync)
 * 2. Reparenting DURING drag (not on drag end)
 * 3. Group drag moves children
 * 4. Position preservation
 */

import { DragCoordinator, createDragCoordinator, resetDragCoordinator } from '../DragCoordinator';
import type { ViewState } from '../../viewstate/ViewState';
import type { RawGraph } from '../../../components/graph/types';
import type { Node } from '@xyflow/react';

// Mock dependencies
jest.mock('../../../utils/canvasPersistence', () => ({
  saveCanvasSnapshot: jest.fn(),
}));

import { saveCanvasSnapshot } from '../../../utils/canvasPersistence';

describe('DragCoordinator', () => {
  let coordinator: DragCoordinator;
  let viewStateRef: { current: ViewState };
  let domainRef: { current: RawGraph | null };
  let setRawGraphMock: jest.Mock;
  let setNodesMock: jest.Mock;
  let reactFlowNodes: Node[];

  beforeEach(() => {
    resetDragCoordinator();
    jest.clearAllMocks();
    
    // Reset mocks
    setRawGraphMock = jest.fn();
    setNodesMock = jest.fn((updater) => {
      if (typeof updater === 'function') {
        reactFlowNodes = updater(reactFlowNodes);
      } else {
        reactFlowNodes = updater;
      }
    });

    // Initialize ViewState with test data
    viewStateRef = {
      current: {
        node: {
          'node-1': { x: 300, y: 300, w: 96, h: 96 },
          'node-2': { x: 500, y: 500, w: 96, h: 96 },
        },
        group: {
          'group-1': { x: 100, y: 100, w: 300, h: 300 },
        },
        edge: {},
      },
    };

    // Initialize Domain with test data
    domainRef = {
      current: {
        id: 'root',
        children: [
          { id: 'node-1', labels: [{ text: 'Node 1' }] },
          { id: 'node-2', labels: [{ text: 'Node 2' }] },
          { id: 'group-1', children: [], labels: [{ text: 'Group 1' }] },
        ],
        edges: [],
      },
    };

    // Initialize ReactFlow nodes
    reactFlowNodes = [
      { id: 'node-1', type: 'custom', position: { x: 300, y: 300 }, data: {} },
      { id: 'node-2', type: 'custom', position: { x: 500, y: 500 }, data: {} },
      { id: 'group-1', type: 'group', position: { x: 100, y: 100 }, data: {} },
    ] as Node[];

    // Create coordinator
    coordinator = createDragCoordinator({
      viewStateRef,
      domainRef,
      setRawGraph: setRawGraphMock,
      setNodes: setNodesMock,
      getReactFlowNodes: () => reactFlowNodes,
      architectureId: 'test-arch',
    });
  });

  // ============================================
  // 1. State Synchronization Tests
  // ============================================
  
  describe('State Synchronization', () => {
    it('ViewState updates immediately during drag', () => {
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 400, y: 400 });

      // ViewState should be updated DURING drag, not after
      expect(viewStateRef.current.node['node-1'].x).toBe(400);
      expect(viewStateRef.current.node['node-1'].y).toBe(400);
    });

    it('Domain ref and React state stay in sync after reparent', () => {
      // Move node into group bounds
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 150, y: 150 }); // Inside group

      // setRawGraph should be called with updated domain
      expect(setRawGraphMock).toHaveBeenCalled();
      
      // domainRef should be updated
      const group = domainRef.current?.children?.find((c: any) => c.id === 'group-1');
      expect(group?.children?.some((c: any) => c.id === 'node-1')).toBe(true);
      
      // The domain passed to setRawGraph should match domainRef
      const passedDomain = setRawGraphMock.mock.calls[0][0];
      expect(JSON.stringify(passedDomain)).toBe(JSON.stringify(domainRef.current));
    });

    it('ViewState position unchanged when reparenting', () => {
      const originalX = 150;
      const originalY = 150;

      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: originalX, y: originalY });

      // ViewState should have absolute position (unchanged by reparenting)
      expect(viewStateRef.current.node['node-1'].x).toBe(originalX);
      expect(viewStateRef.current.node['node-1'].y).toBe(originalY);
    });
  });

  // ============================================
  // 2. Reparenting DURING Drag Tests
  // ============================================
  
  describe('Reparenting During Drag', () => {
    it('reparents node INTO group DURING drag, not after', () => {
      // Node starts at root
      expect(domainRef.current?.children?.some((c: any) => c.id === 'node-1')).toBe(true);
      
      coordinator.handleDragStart(['node-1']);
      
      // Move into group bounds - reparenting should happen NOW
      coordinator.handleDragMove('node-1', { x: 150, y: 150 });

      // Check DURING drag (before handleDragEnd)
      const group = domainRef.current?.children?.find((c: any) => c.id === 'group-1');
      expect(group?.children?.some((c: any) => c.id === 'node-1')).toBe(true);
      
      // Node should no longer be at root
      expect(domainRef.current?.children?.some((c: any) => c.id === 'node-1')).toBe(false);
    });

    it('reparents node OUT OF group DURING drag', () => {
      // Setup: node-1 is inside group-1
      domainRef.current = {
        id: 'root',
        children: [
          { id: 'node-2', labels: [{ text: 'Node 2' }] },
          {
            id: 'group-1',
            children: [{ id: 'node-1', labels: [{ text: 'Node 1' }] }],
            labels: [{ text: 'Group 1' }],
          },
        ],
        edges: [],
      };

      coordinator.handleDragStart(['node-1']);
      
      // Move outside group bounds - reparenting should happen NOW
      coordinator.handleDragMove('node-1', { x: 500, y: 500 });

      // Check DURING drag
      // Node should be at root now
      expect(domainRef.current?.children?.some((c: any) => c.id === 'node-1')).toBe(true);
      
      // Group should not contain node
      const group = domainRef.current?.children?.find((c: any) => c.id === 'group-1');
      expect(group?.children?.some((c: any) => c.id === 'node-1')).toBe(false);
    });

    it('does NOT reparent if node only partially overlaps group', () => {
      coordinator.handleDragStart(['node-1']);
      
      // Node at (350, 150) with size 96x96 extends to (446, 246)
      // Group ends at (400, 400), so node extends beyond right edge
      coordinator.handleDragMove('node-1', { x: 350, y: 150 });

      // Node should still be at root (not reparented)
      expect(domainRef.current?.children?.some((c: any) => c.id === 'node-1')).toBe(true);
      
      // setRawGraph should NOT have been called (no reparenting)
      expect(setRawGraphMock).not.toHaveBeenCalled();
    });

    it('sets group to FREE mode when node is dropped into it', () => {
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 150, y: 150 });

      const group = domainRef.current?.children?.find((c: any) => c.id === 'group-1');
      expect(group?.mode).toBe('FREE');
    });
  });

  // ============================================
  // 3. Group Drag Tests
  // ============================================
  
  describe('Group Drag - Children Move With Group', () => {
    beforeEach(() => {
      // Setup: node-1 is inside group-1
      domainRef.current = {
        id: 'root',
        children: [
          {
            id: 'group-1',
            children: [{ id: 'node-1', labels: [{ text: 'Node 1' }] }],
            labels: [{ text: 'Group 1' }],
          },
        ],
        edges: [],
      };

      // ViewState with node inside group
      viewStateRef.current = {
        node: {
          'node-1': { x: 150, y: 150, w: 96, h: 96 }, // Absolute position
        },
        group: {
          'group-1': { x: 100, y: 100, w: 300, h: 300 },
        },
        edge: {},
      };

      // ReactFlow nodes
      reactFlowNodes = [
        { id: 'node-1', type: 'custom', position: { x: 150, y: 150 }, data: {} },
        { id: 'group-1', type: 'group', position: { x: 100, y: 100 }, data: {} },
      ] as Node[];
    });

    it('children ViewState updates when group is dragged', () => {
      // Group starts at (100, 100), node-1 is at (150, 150) absolute
      // Drag group by (50, 50) to (150, 150)
      coordinator.handleDragStart(['group-1']);
      coordinator.handleDragMove('group-1', { x: 150, y: 150 });

      // Group should be at new position
      expect(viewStateRef.current.group['group-1'].x).toBe(150);
      expect(viewStateRef.current.group['group-1'].y).toBe(150);

      // Child should move by same delta (50, 50)
      // Original: (150, 150) + (50, 50) = (200, 200)
      expect(viewStateRef.current.node['node-1'].x).toBe(200);
      expect(viewStateRef.current.node['node-1'].y).toBe(200);
    });

    it('setNodes is called to update ReactFlow child positions', () => {
      coordinator.handleDragStart(['group-1']);
      coordinator.handleDragMove('group-1', { x: 150, y: 150 });

      // setNodes should be called to update child positions
      expect(setNodesMock).toHaveBeenCalled();
    });

    it('group drag does NOT trigger reparenting of group itself', () => {
      // Add another group
      domainRef.current?.children?.push({
        id: 'group-2',
        children: [],
        labels: [{ text: 'Group 2' }],
      });
      viewStateRef.current.group['group-2'] = { x: 500, y: 500, w: 300, h: 300 };
      reactFlowNodes.push({
        id: 'group-2',
        type: 'group',
        position: { x: 500, y: 500 },
        data: {},
      } as Node);

      // Drag group-1 into group-2's bounds
      coordinator.handleDragStart(['group-1']);
      coordinator.handleDragMove('group-1', { x: 550, y: 550 });

      // group-1 should NOT be reparented into group-2
      // (groups don't auto-nest)
      expect(domainRef.current?.children?.some((c: any) => c.id === 'group-1')).toBe(true);
    });
  });

  // ============================================
  // 4. Position Preservation Tests
  // ============================================
  
  describe('Position Preservation', () => {
    it('absolute position preserved when reparenting into group', () => {
      const targetX = 200;
      const targetY = 200;

      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: targetX, y: targetY });

      // ViewState should have absolute position (not relative to group)
      expect(viewStateRef.current.node['node-1'].x).toBe(targetX);
      expect(viewStateRef.current.node['node-1'].y).toBe(targetY);
    });

    it('absolute position preserved when reparenting out of group', () => {
      // Setup: node-1 is inside group-1
      domainRef.current = {
        id: 'root',
        children: [
          {
            id: 'group-1',
            children: [{ id: 'node-1', labels: [{ text: 'Node 1' }] }],
            labels: [{ text: 'Group 1' }],
          },
        ],
        edges: [],
      };
      viewStateRef.current.node['node-1'] = { x: 150, y: 150, w: 96, h: 96 };

      const targetX = 600;
      const targetY = 600;

      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: targetX, y: targetY });

      // ViewState should have new absolute position
      expect(viewStateRef.current.node['node-1'].x).toBe(targetX);
      expect(viewStateRef.current.node['node-1'].y).toBe(targetY);
    });
  });

  // ============================================
  // 5. Edge Cases
  // ============================================
  
  describe('Edge Cases', () => {
    it('handles drag move without explicit drag start', () => {
      // Should auto-start drag
      coordinator.handleDragMove('node-1', { x: 400, y: 400 });

      expect(coordinator.isDragging()).toBe(true);
      expect(viewStateRef.current.node['node-1'].x).toBe(400);
    });

    it('handles drag end without drag start gracefully', () => {
      // Should not throw
      expect(() => coordinator.handleDragEnd()).not.toThrow();
    });

    it('handles missing ViewState geometry gracefully', () => {
      delete viewStateRef.current.node['node-1'];
      
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 400, y: 400 });

      // Should create new geometry
      expect(viewStateRef.current.node['node-1']).toBeDefined();
      expect(viewStateRef.current.node['node-1'].x).toBe(400);
    });

    it('handles multiple nodes dragged together', () => {
      coordinator.handleDragStart(['node-1', 'node-2']);
      coordinator.handleDragMove('node-1', { x: 350, y: 350 });
      coordinator.handleDragMove('node-2', { x: 550, y: 550 });

      expect(viewStateRef.current.node['node-1'].x).toBe(350);
      expect(viewStateRef.current.node['node-2'].x).toBe(550);
    });
  });

  // ============================================
  // 6. Persistence Tests
  // ============================================
  
  describe('Persistence', () => {
    it('persists to localStorage on drag end', () => {
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 400, y: 400 });
      coordinator.handleDragEnd();

      expect(saveCanvasSnapshot).toHaveBeenCalledWith(
        domainRef.current,
        viewStateRef.current,
        'test-arch'
      );
    });

    it('does NOT persist during drag (only on end)', () => {
      coordinator.handleDragStart(['node-1']);
      coordinator.handleDragMove('node-1', { x: 400, y: 400 });

      // Should not have persisted yet (persistence only on drag end)
      expect(saveCanvasSnapshot).not.toHaveBeenCalled();
    });
  });
});
