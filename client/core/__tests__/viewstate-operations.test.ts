/**
 * ViewState Geometry Operations Tests
 * 
 * Tests the ViewState data structure and operations that won't change during refactor.
 * ViewState is the authoritative geometry source for rendering.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { createEmptyViewState } from '../viewstate/ViewState';
import { ViewState, ViewStateGeometry } from '../viewstate/ViewState';

describe('ViewState Operations (Refactor-Safe)', () => {
  let viewState: ViewState;

  beforeEach(() => {
    viewState = createEmptyViewState();
  });

  describe('ViewState Structure', () => {
    test('createEmptyViewState has correct structure', () => {
      expect(viewState).toEqual({
        node: {},
        group: {},
        edge: {},
        layout: {}
      });
    });

    test('supports node geometry', () => {
      const geometry: ViewStateGeometry = { x: 100, y: 200, w: 96, h: 96 };
      viewState.node['node1'] = geometry;
      
      expect(viewState.node['node1']).toEqual(geometry);
    });

    test('supports group geometry', () => {
      const geometry: ViewStateGeometry = { x: 50, y: 100, w: 300, h: 200 };
      viewState.group['group1'] = geometry;
      
      expect(viewState.group['group1']).toEqual(geometry);
    });

    test('supports edge waypoints', () => {
      viewState.edge['edge1'] = { 
        waypoints: [
          { x: 100, y: 100 },
          { x: 200, y: 150 },
          { x: 300, y: 200 }
        ]
      };
      
      expect(viewState.edge['edge1'].waypoints).toHaveLength(3);
    });
  });

  describe('Geometry Operations', () => {
    test('updateNodeGeometry', () => {
      const updateNodeGeometry = (vs: ViewState, nodeId: string, geometry: ViewStateGeometry) => {
        vs.node[nodeId] = geometry;
        return vs;
      };

      const geometry = { x: 150, y: 250, w: 96, h: 96 };
      updateNodeGeometry(viewState, 'node1', geometry);
      
      expect(viewState.node['node1']).toEqual(geometry);
    });

    test('getNodePosition', () => {
      const getNodePosition = (vs: ViewState, nodeId: string) => {
        const geometry = vs.node[nodeId];
        return geometry ? { x: geometry.x, y: geometry.y } : null;
      };

      viewState.node['node1'] = { x: 100, y: 200, w: 96, h: 96 };
      
      const position = getNodePosition(viewState, 'node1');
      expect(position).toEqual({ x: 100, y: 200 });
      
      const missingPosition = getNodePosition(viewState, 'missing');
      expect(missingPosition).toBeNull();
    });

    test('setGroupBounds', () => {
      const setGroupBounds = (vs: ViewState, groupId: string, bounds: ViewStateGeometry) => {
        vs.group[groupId] = bounds;
        return vs;
      };

      const bounds = { x: 0, y: 0, w: 400, h: 300 };
      setGroupBounds(viewState, 'group1', bounds);
      
      expect(viewState.group['group1']).toEqual(bounds);
    });
  });

  describe('ViewState Validation', () => {
    test('geometry has required properties', () => {
      const isValidGeometry = (geometry: any): geometry is ViewStateGeometry => {
        return typeof geometry === 'object' &&
               typeof geometry.x === 'number' &&
               typeof geometry.y === 'number' &&
               typeof geometry.w === 'number' &&
               typeof geometry.h === 'number';
      };

      const validGeometry = { x: 100, y: 200, w: 96, h: 96 };
      expect(isValidGeometry(validGeometry)).toBe(true);

      const invalidGeometry = { x: 100, y: 200 }; // missing w, h
      expect(isValidGeometry(invalidGeometry)).toBe(false);
    });

    test('viewState has geometry for all rendered items', () => {
      // This would be used to validate that every rendered node/group has ViewState
      const hasGeometryForItem = (vs: ViewState, itemId: string, itemType: 'node' | 'group') => {
        return itemType === 'node' ? !!vs.node[itemId] : !!vs.group[itemId];
      };

      viewState.node['node1'] = { x: 100, y: 200, w: 96, h: 96 };
      viewState.group['group1'] = { x: 0, y: 0, w: 300, h: 200 };

      expect(hasGeometryForItem(viewState, 'node1', 'node')).toBe(true);
      expect(hasGeometryForItem(viewState, 'group1', 'group')).toBe(true);
      expect(hasGeometryForItem(viewState, 'missing', 'node')).toBe(false);
    });
  });

  describe('ViewState Synchronization', () => {
    test('ViewState can be cloned safely', () => {
      viewState.node['node1'] = { x: 100, y: 200, w: 96, h: 96 };
      viewState.group['group1'] = { x: 0, y: 0, w: 300, h: 200 };
      
      const cloned = JSON.parse(JSON.stringify(viewState));
      
      expect(cloned).toEqual(viewState);
      expect(cloned).not.toBe(viewState); // Different reference
    });

    test('ViewState updates are isolated', () => {
      const vs1 = createEmptyViewState();
      const vs2 = createEmptyViewState();
      
      vs1.node['node1'] = { x: 100, y: 200, w: 96, h: 96 };
      
      expect(vs1.node['node1']).toBeDefined();
      expect(vs2.node['node1']).toBeUndefined();
    });
  });
});





