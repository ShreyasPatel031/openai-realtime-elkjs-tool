/**
 * Tests for ScopedLayoutRunner
 * Part of Agent C - Wave 1
 * 
 * Tests validate:
 * - Anchored layout (top-left preserved)
 * - Scoped ELK execution
 * - ViewStateDelta output format
 */

import { runScopeLayout } from '../ScopedLayoutRunner';
import type { LayoutOptions } from '../types';
import type { RawGraph } from '../../../components/graph/types/index';
import type { ViewState } from '../../viewstate/ViewState';

describe('ScopedLayoutRunner', () => {
  // Helper to create a minimal test graph
  function createTestGraph(): RawGraph {
    return {
      id: 'root',
      children: [
        {
          id: 'group-1',
          children: [
            { id: 'node-1', labels: [{ text: 'Node 1' }] },
            { id: 'node-2', labels: [{ text: 'Node 2' }] }
          ],
          edges: [
            {
              id: 'edge-1',
              sources: ['node-1'],
              targets: ['node-2']
            }
          ]
        }
      ],
      edges: []
    };
  }

  // Helper to create test ViewState
  function createTestViewState(): ViewState {
    return {
      node: {
        'node-1': { x: 100, y: 100, w: 100, h: 96 },
        'node-2': { x: 250, y: 100, w: 100, h: 96 }
      },
      group: {
        'group-1': { x: 50, y: 50, w: 350, h: 200 }
      },
      edge: {}
    };
  }

  it('should export runScopeLayout function', () => {
    expect(typeof runScopeLayout).toBe('function');
  });

  it('should return ViewStateDelta with node and group geometry', async () => {
    const graph = createTestGraph();
    const viewState = createTestViewState();
    
    const result = await runScopeLayout('group-1', graph, viewState);
    
    expect(result).toBeDefined();
    expect(result.node).toBeDefined();
    expect(result.group).toBeDefined();
    expect(result.edge).toBeDefined();
    
    // Should have geometry for nodes in the scope
    expect(result.node?.['node-1']).toBeDefined();
    expect(result.node?.['node-2']).toBeDefined();
    expect(result.node?.['node-1']?.x).toBeDefined();
    expect(result.node?.['node-1']?.y).toBeDefined();
    
    // Should have geometry for the scope group itself
    expect(result.group?.['group-1']).toBeDefined();
    expect(result.group?.['group-1']?.x).toBeDefined();
    expect(result.group?.['group-1']?.y).toBeDefined();
  });

  it('should preserve anchor top-left when ViewState exists', async () => {
    const graph = createTestGraph();
    const viewState = createTestViewState();
    
    // The anchor should be at (50, 50) - the group's top-left
    const anchorX = viewState.group!['group-1']!.x;
    const anchorY = viewState.group!['group-1']!.y;
    
    const result = await runScopeLayout('group-1', graph, viewState);
    
    // After layout, the group's top-left should be preserved (anchored)
    const newGroupX = result.group?.['group-1']?.x;
    const newGroupY = result.group?.['group-1']?.y;
    
    expect(newGroupX).toBeDefined();
    expect(newGroupY).toBeDefined();
    // The anchor should be preserved (within small tolerance for ELK rounding)
    expect(Math.abs((newGroupX || 0) - anchorX)).toBeLessThan(10);
    expect(Math.abs((newGroupY || 0) - anchorY)).toBeLessThan(10);
  });

  it('should handle missing scope gracefully', async () => {
    const graph = createTestGraph();
    const viewState = createTestViewState();
    
    const result = await runScopeLayout('non-existent-group', graph, viewState);
    
    // Should return empty delta for missing scope
    expect(result).toEqual({});
  });

  it('should accept optional LayoutOptions', async () => {
    const graph = createTestGraph();
    const viewState = createTestViewState();
    const opts: LayoutOptions = { anchorId: 'node-1' };
    
    const result = await runScopeLayout('group-1', graph, viewState, opts);
    
    expect(result).toBeDefined();
    expect(result.node).toBeDefined();
  });

  it('should auto-fit group frame to children', async () => {
    const graph = createTestGraph();
    const viewState = createTestViewState();
    
    const result = await runScopeLayout('group-1', graph, viewState);
    
    const groupGeom = result.group?.['group-1'];
    expect(groupGeom).toBeDefined();
    expect(groupGeom?.w).toBeGreaterThan(0);
    expect(groupGeom?.h).toBeGreaterThan(0);
  });

  it('should handle empty ViewState (no anchor)', async () => {
    const graph = createTestGraph();
    const emptyViewState: ViewState = { node: {}, group: {}, edge: {} };
    
    const result = await runScopeLayout('group-1', graph, emptyViewState);
    
    // Should still produce layout, just without anchoring
    expect(result).toBeDefined();
    expect(result.node).toBeDefined();
    expect(result.group).toBeDefined();
  });
});

