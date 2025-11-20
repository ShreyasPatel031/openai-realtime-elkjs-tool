/**
 * Tests for adjustForReparent - FREE structural reparenting
 * Part of Agent B Inter Plan - B7
 */

import { adjustForReparent } from '../adjust';
import type { ViewState } from '../ViewState';

describe('adjustForReparent', () => {
  const createMockGetGroupWorldPos = (positions: Record<string, { x: number; y: number }>) => {
    return (groupId: string) => positions[groupId];
  };

  it('should preserve world position when reparenting within same level', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 50, y: 50, w: 96, h: 96 },
      },
      group: {
        'group-1': { x: 100, y: 100, w: 288, h: 288 },
        'group-2': { x: 300, y: 100, w: 288, h: 288 },
      },
      edge: {},
    };

    const getGroupWorldPos = createMockGetGroupWorldPos({
      'group-1': { x: 100, y: 100 },
      'group-2': { x: 300, y: 100 },
    });

    // Node is at relative (50, 50) in group-1
    // World position: (100 + 50, 100 + 50) = (150, 150)
    // After reparent to group-2 at (300, 100):
    // New relative: (150 - 300, 150 - 100) = (-150, 50)

    const result = adjustForReparent({
      nodeId: 'node-1',
      oldParentId: 'group-1',
      newParentId: 'group-2',
      viewState,
      getGroupWorldPos,
    });

    expect(result.node?.['node-1']).toEqual({
      x: -150,
      y: 50,
      w: 96,
      h: 96,
    });

    // Verify world position is preserved
    const newWorldX = 300 + (-150); // 150
    const newWorldY = 100 + 50; // 150
    expect(newWorldX).toBe(150);
    expect(newWorldY).toBe(150);
  });

  it('should handle reparenting to root', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 50, y: 50, w: 96, h: 96 },
      },
      group: {
        'group-1': { x: 100, y: 100, w: 288, h: 288 },
      },
      edge: {},
    };

    const getGroupWorldPos = createMockGetGroupWorldPos({
      'group-1': { x: 100, y: 100 },
    });

    // Node at relative (50, 50) in group-1
    // World position: (150, 150)
    // After reparent to root (0, 0):
    // New relative: (150 - 0, 150 - 0) = (150, 150)

    const result = adjustForReparent({
      nodeId: 'node-1',
      oldParentId: 'group-1',
      newParentId: 'root',
      viewState,
      getGroupWorldPos,
    });

    expect(result.node?.['node-1']).toEqual({
      x: 150,
      y: 150,
      w: 96,
      h: 96,
    });
  });

  it('should handle reparenting from root', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 150, y: 150, w: 96, h: 96 },
      },
      group: {
        'group-1': { x: 100, y: 100, w: 288, h: 288 },
      },
      edge: {},
    };

    const getGroupWorldPos = createMockGetGroupWorldPos({
      'group-1': { x: 100, y: 100 },
    });

    // Node at (150, 150) in root
    // After reparent to group-1 at (100, 100):
    // New relative: (150 - 100, 150 - 100) = (50, 50)

    const result = adjustForReparent({
      nodeId: 'node-1',
      oldParentId: 'root',
      newParentId: 'group-1',
      viewState,
      getGroupWorldPos,
    });

    expect(result.node?.['node-1']).toEqual({
      x: 50,
      y: 50,
      w: 96,
      h: 96,
    });
  });

  it('should return unchanged ViewState if node geometry missing', () => {
    const viewState: ViewState = {
      node: {},
      group: {},
      edge: {},
    };

    const getGroupWorldPos = createMockGetGroupWorldPos({});

    const result = adjustForReparent({
      nodeId: 'node-1',
      oldParentId: 'group-1',
      newParentId: 'group-2',
      viewState,
      getGroupWorldPos,
    });

    expect(result).toEqual(viewState);
  });

  it('should handle nested reparenting (group within group)', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 20, y: 20, w: 96, h: 96 },
      },
      group: {
        'group-1': { x: 100, y: 100, w: 288, h: 288 },
        'group-2': { x: 400, y: 200, w: 288, h: 288 },
        'group-3': { x: 50, y: 50, w: 200, h: 200 }, // nested in group-1
      },
      edge: {},
    };

    const getGroupWorldPos = createMockGetGroupWorldPos({
      'group-1': { x: 100, y: 100 },
      'group-2': { x: 400, y: 200 },
      'group-3': { x: 150, y: 150 }, // 100+50, 100+50
    });

    // Node at (20, 20) in group-3
    // World position: (150 + 20, 150 + 20) = (170, 170)
    // After reparent to group-2 at (400, 200):
    // New relative: (170 - 400, 170 - 200) = (-230, -30)

    const result = adjustForReparent({
      nodeId: 'node-1',
      oldParentId: 'group-3',
      newParentId: 'group-2',
      viewState,
      getGroupWorldPos,
    });

    expect(result.node?.['node-1']?.x).toBe(-230);
    expect(result.node?.['node-1']?.y).toBe(-30);

    // Verify world position preserved
    const newWorldX = 400 + (-230);
    const newWorldY = 200 + (-30);
    expect(newWorldX).toBe(170);
    expect(newWorldY).toBe(170);
  });
});





