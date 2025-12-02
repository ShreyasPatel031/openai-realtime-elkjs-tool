/**
 * Tests for ReactFlowAdapter - ViewState-first rendering contract
 * Part of Agent B Inter Plan - B7
 */

import { toReactFlowWithViewState } from '../ReactFlowAdapter';
import type { ViewState } from '../../viewstate/ViewState';
import type { NodeDimensions } from '../types';

describe('ReactFlowAdapter', () => {
  const mockDimensions: NodeDimensions = {
    width: 96,
    height: 96,
    groupWidth: 288,
    groupHeight: 288,
    padding: 10,
  };

  const mockElkGraph = {
    id: 'root',
    children: [
      {
        id: 'node-1',
        x: 100,
        y: 100,
        width: 96,
        height: 96,
        labels: [{ text: 'Node 1' }],
      },
      {
        id: 'group-1',
        x: 200,
        y: 200,
        width: 288,
        height: 288,
        labels: [{ text: 'Group 1' }],
        children: [
          {
            id: 'node-2',
            x: 10,
            y: 10,
            width: 96,
            height: 96,
            labels: [{ text: 'Node 2' }],
          },
        ],
      },
    ],
    edges: [],
  };

  describe('ViewState-first contract', () => {
    it('should use ViewState positions for nodes', () => {
      const viewState: ViewState = {
        node: {
          'node-1': { x: 50, y: 50, w: 96, h: 96 },
          // node-2 is inside group-1 at (250, 250), so absolute position should be (250 + 15, 250 + 15)
          'node-2': { x: 265, y: 265, w: 96, h: 96 },
        },
        group: {
          'group-1': { x: 250, y: 250, w: 288, h: 288 },
        },
        edge: {},
      };

      const { nodes } = toReactFlowWithViewState(
        mockElkGraph,
        mockDimensions,
        viewState
      );

      const node1 = nodes.find((n) => n.id === 'node-1');
      const node2 = nodes.find((n) => n.id === 'node-2');
      const group1 = nodes.find((n) => n.id === 'group-1');

      expect(node1?.position).toEqual({ x: 50, y: 50 });
      // node-2 should have relative position (15, 15) since it's inside group-1
      expect(node2?.position).toEqual({ x: 15, y: 15 });
      expect(group1?.position).toEqual({ x: 250, y: 250 });
    });

    it('should throw in dev mode when ViewState geometry is missing', () => {
      const viewState: ViewState = {
        node: {
          // 'node-1' missing
        },
        group: {},
        edge: {},
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => {
        toReactFlowWithViewState(mockElkGraph, mockDimensions, viewState, {
          strictGeometry: true,
        });
      }).toThrow(/Missing ViewState geometry/);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('strictGeometry option', () => {
    it('should allow ELK fallback when strictGeometry is false', () => {
      const viewState: ViewState = {
        node: {},
        group: {},
        edge: {},
      };

      const { nodes } = toReactFlowWithViewState(
        mockElkGraph,
        mockDimensions,
        viewState,
        { strictGeometry: false }
      );

      // Should not throw, should use ELK positions
      expect(nodes.length).toBeGreaterThan(0);
    });
  });
});

