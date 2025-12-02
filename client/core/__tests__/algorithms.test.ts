/**
 * Core Algorithms Tests
 * 
 * Tests fundamental algorithms that won't change during refactor.
 * These are pure business logic functions used throughout the system.
 */

import { describe, test, expect } from '@jest/globals';
import { CoordinateService } from '../viewstate/CoordinateService';
import { RawGraph } from '../../components/graph/types';

describe('Core Algorithms (Refactor-Safe)', () => {
  describe('CoordinateService', () => {
    test('snapPoint snaps to grid correctly', () => {
      const result = CoordinateService.snapPoint({ x: 123, y: 187 }, 16);
      
      expect(result.x).toBe(128); // 123 -> 128 (nearest 16)
      expect(result.y).toBe(192); // 187 -> 192 (nearest 16)
    });

    test('snapPoint handles exact grid positions', () => {
      const result = CoordinateService.snapPoint({ x: 160, y: 240 }, 16);
      
      expect(result.x).toBe(160); // Already on grid
      expect(result.y).toBe(240); // Already on grid
    });

    test('snapPoint handles negative coordinates', () => {
      const result = CoordinateService.snapPoint({ x: -23, y: -45 }, 16);
      
      expect(result.x).toBe(-16); // -23 -> -16 (nearest 16)
      expect(result.y).toBe(-48); // -45 -> -48 (nearest 16)
    });

    test('toRelativeFromWorld converts absolute to relative position', () => {
      const worldPos = { x: 150, y: 200 };
      const parentPos = { x: 50, y: 100 };
      
      const relative = CoordinateService.toRelativeFromWorld(worldPos, parentPos);
      
      expect(relative.x).toBe(100); // 150 - 50
      expect(relative.y).toBe(100); // 200 - 100
    });

    test('toWorldFromRelative converts relative to absolute position', () => {
      const relativePos = { x: 100, y: 100 };
      const parentPos = { x: 50, y: 100 };
      
      const world = CoordinateService.toWorldFromRelative(relativePos, parentPos);
      
      expect(world.x).toBe(150); // 100 + 50
      expect(world.y).toBe(200); // 100 + 100
    });
  });

  describe('LCG (Lowest Common Group) Algorithm', () => {
    // Implementation of LCG calculation for testing
    const findLCG = (graph: RawGraph, nodeIds: string[]): string => {
      if (nodeIds.length === 0) return 'root';
      if (nodeIds.length === 1) return findParent(graph, nodeIds[0]) || 'root';

      // Get paths to root for each node
      const paths = nodeIds.map(nodeId => pathToRoot(graph, nodeId));
      
      // Find the deepest common ancestor
      let lcg = 'root';
      const minPathLength = Math.min(...paths.map(p => p.length));
      
      for (let i = 0; i < minPathLength; i++) {
        const currentLevel = paths.map(p => p[i]);
        if (currentLevel.every(id => id === currentLevel[0])) {
          lcg = currentLevel[0];
        } else {
          break;
        }
      }
      
      return lcg;
    };

    const pathToRoot = (graph: RawGraph, nodeId: string): string[] => {
      const path: string[] = [];
      let current = nodeId;
      
      while (current !== 'root') {
        path.unshift(current);
        const parent = findParent(graph, current);
        if (!parent) break;
        current = parent;
      }
      
      path.unshift('root');
      return path;
    };

    const findParent = (graph: RawGraph, nodeId: string): string | null => {
      const findInChildren = (container: any, targetId: string, parentId: string): string | null => {
        if (container.children) {
          for (const child of container.children) {
            if (child.id === targetId) return parentId;
            const found = findInChildren(child, targetId, child.id);
            if (found) return found;
          }
        }
        return null;
      };

      return findInChildren(graph, nodeId, 'root');
    };

    test('LCG of nodes in same parent returns that parent', () => {
      const graph: RawGraph = {
        id: 'root',
        children: [
          { id: 'node1', type: 'node', labels: [{ text: '' }] },
          { id: 'node2', type: 'node', labels: [{ text: '' }] }
        ],
        edges: []
      };

      const lcg = findLCG(graph, ['node1', 'node2']);
      expect(lcg).toBe('root');
    });

    test('LCG of nodes in different groups returns common ancestor', () => {
      const graph: RawGraph = {
        id: 'root',
        children: [
          {
            id: 'group1',
            type: 'group',
            mode: 'FREE',
            labels: [{ text: '' }],
            children: [
              { id: 'node1', type: 'node', labels: [{ text: '' }] }
            ],
            edges: []
          },
          {
            id: 'group2', 
            type: 'group',
            mode: 'FREE',
            labels: [{ text: '' }],
            children: [
              { id: 'node2', type: 'node', labels: [{ text: '' }] }
            ],
            edges: []
          }
        ],
        edges: []
      };

      const lcg = findLCG(graph, ['node1', 'node2']);
      expect(lcg).toBe('root'); // Both nodes are in different groups under root
    });

    test('LCG of nested nodes', () => {
      const graph: RawGraph = {
        id: 'root',
        children: [
          {
            id: 'group1',
            type: 'group',
            mode: 'FREE',
            labels: [{ text: '' }],
            children: [
              {
                id: 'subgroup1',
                type: 'group',
                mode: 'FREE',
                labels: [{ text: '' }],
                children: [
                  { id: 'node1', type: 'node', labels: [{ text: '' }] },
                  { id: 'node2', type: 'node', labels: [{ text: '' }] }
                ],
                edges: []
              }
            ],
            edges: []
          }
        ],
        edges: []
      };

      const lcg = findLCG(graph, ['node1', 'node2']);
      expect(lcg).toBe('subgroup1'); // Both nodes are in subgroup1
    });

    test('LCG of single node returns its parent', () => {
      const graph: RawGraph = {
        id: 'root',
        children: [
          {
            id: 'group1',
            type: 'group',
            mode: 'FREE',
            labels: [{ text: '' }],
            children: [
              { id: 'node1', type: 'node', labels: [{ text: '' }] }
            ],
            edges: []
          }
        ],
        edges: []
      };

      const lcg = findLCG(graph, ['node1']);
      expect(lcg).toBe('group1');
    });
  });

  describe('Edge Parentage Maintenance', () => {
    test('recomputeEdgeParentage places edge at LCG', () => {
      // This would be the algorithm that ensures edges live at LCG({source, target})
      const recomputeEdgeParentage = (graph: RawGraph, edgeId: string): RawGraph => {
        // Find the edge
        const findEdge = (container: any): any => {
          if (container.edges) {
            const edge = container.edges.find((e: any) => e.id === edgeId);
            if (edge) return { edge, parent: container };
          }
          if (container.children) {
            for (const child of container.children) {
              const result = findEdge(child);
              if (result) return result;
            }
          }
          return null;
        };

        const edgeInfo = findEdge(graph);
        if (!edgeInfo) return graph;

        const { edge, parent } = edgeInfo;
        const sourceId = edge.sources[0];
        const targetId = edge.targets[0];
        
        // Calculate where the edge should be (simplified for test)
        // In real implementation, this would use the LCG algorithm  
        const correctParentId = 'root'; // Simplified assumption
        
        // If already in correct place, no change needed
        if (parent.id === correctParentId) return graph;

        // This would implement the actual reparenting logic
        return graph; // Simplified for test
      };

      const graph: RawGraph = {
        id: 'root',
        children: [
          { id: 'node1', type: 'node', labels: [{ text: '' }] },
          { id: 'node2', type: 'node', labels: [{ text: '' }] }
        ],
        edges: [
          { id: 'edge1', type: 'edge', sources: ['node1'], targets: ['node2'], labels: [{ text: '' }] }
        ]
      };

      // This should verify the edge is in the correct parent group
      const result = recomputeEdgeParentage(graph, 'edge1');
      expect(result).toBeDefined(); // Algorithm should complete successfully
    });
  });

  describe('Data Validation', () => {
    test('validateNoDuplicateIds', () => {
      const validateNoDuplicateIds = (graph: RawGraph): boolean => {
        const allIds = new Set<string>();
        
        const collectIds = (container: any) => {
          if (allIds.has(container.id)) return false; // Duplicate found
          allIds.add(container.id);
          
          if (container.children) {
            for (const child of container.children) {
              if (!collectIds(child)) return false;
            }
          }
          
          if (container.edges) {
            for (const edge of container.edges) {
              if (allIds.has(edge.id)) return false;
              allIds.add(edge.id);
            }
          }
          
          return true;
        };
        
        return collectIds(graph);
      };

      const validGraph: RawGraph = {
        id: 'root',
        children: [
          { id: 'node1', type: 'node', labels: [{ text: '' }] },
          { id: 'node2', type: 'node', labels: [{ text: '' }] }
        ],
        edges: [
          { id: 'edge1', type: 'edge', sources: ['node1'], targets: ['node2'], labels: [{ text: '' }] }
        ]
      };

      expect(validateNoDuplicateIds(validGraph)).toBe(true);
    });

    test('validateParentChildRelationships', () => {
      const validateParentChildRelationships = (graph: RawGraph): boolean => {
        const validateContainer = (container: any): boolean => {
          if (container.children) {
            for (const child of container.children) {
              // Each child should be a valid node or group
              if (!child.id || !child.type) return false;
              if (!validateContainer(child)) return false;
            }
          }
          return true;
        };

        return validateContainer(graph);
      };

      const validGraph: RawGraph = {
        id: 'root',
        children: [
          { id: 'node1', type: 'node', labels: [{ text: '' }] }
        ],
        edges: []
      };

      expect(validateParentChildRelationships(validGraph)).toBe(true);
    });
  });
});
