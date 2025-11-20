/**
 * Tests for Policy - Agent D Implementation
 * 
 * Tests validate the policy logic for deciding when ELK should run
 * and finding locked ancestors.
 */

import {
  decideLayout,
  findHighestLockedAncestor,
  getAncestorChainToLock,
  findTopMostLockedAncestor,
  shouldAutoLockForAI,
  buildModeMap,
  buildParentOf,
  type DecideLayoutInput,
} from '../Policy';
import type { ModeMap } from '../types';
import type { ElkGraphNode } from '../../../types/graph';

describe('Policy', () => {
  describe('decideLayout', () => {
    it('should return true for AI source (always ELK)', () => {
      const input: DecideLayoutInput = {
        source: 'ai',
        scopeId: 'group-123',
        modeMap: {},
        parentOf: () => null,
      };
      const result = decideLayout(input);
      expect(result).toBe(true);
    });

    it('should return true for user source with LOCK scope', () => {
      const input: DecideLayoutInput = {
        source: 'user',
        scopeId: 'group-123',
        modeMap: { 'group-123': 'LOCK' },
        parentOf: () => null,
      };
      const result = decideLayout(input);
      expect(result).toBe(true);
    });

    it('should return true for user source with LOCK ancestor', () => {
      const input: DecideLayoutInput = {
        source: 'user',
        scopeId: 'node-1',
        modeMap: { 'group-1': 'LOCK' },
        parentOf: (id: string) => (id === 'node-1' ? 'group-1' : null),
      };
      const result = decideLayout(input);
      expect(result).toBe(true);
    });

    it('should return false for user source with FREE scope and no LOCK ancestors', () => {
      const input: DecideLayoutInput = {
        source: 'user',
        scopeId: 'group-123',
        modeMap: { 'group-123': 'FREE' },
        parentOf: () => null,
      };
      const result = decideLayout(input);
      expect(result).toBe(false);
    });

    it('should return false for user source with no mode (defaults to FREE)', () => {
      const input: DecideLayoutInput = {
        source: 'user',
        scopeId: 'group-123',
        modeMap: {},
        parentOf: () => null,
      };
      const result = decideLayout(input);
      expect(result).toBe(false);
    });
  });

  describe('findHighestLockedAncestor', () => {
    it('should return null when no locked ancestor exists', () => {
      const modeMap: ModeMap = {};
      const parentOf = () => null;
      const result = findHighestLockedAncestor('node-1', modeMap, parentOf);
      expect(result).toBeNull();
    });

    it('should return the locked ancestor when found', () => {
      const modeMap: ModeMap = {
        'group-1': 'LOCK',
      };
      const parentOf = (id: string) => (id === 'node-1' ? 'group-1' : null);
      const result = findHighestLockedAncestor('node-1', modeMap, parentOf);
      expect(result).toBe('group-1');
    });

    it('should return the highest (closest to root) locked ancestor', () => {
      const modeMap: ModeMap = {
        'group-1': 'FREE',
        'group-2': 'LOCK',
      };
      const parentOf = (id: string) => {
        if (id === 'node-1') return 'group-1';
        if (id === 'group-1') return 'group-2';
        return null;
      };
      const result = findHighestLockedAncestor('node-1', modeMap, parentOf);
      expect(result).toBe('group-2');
    });

    it('should return null when scope itself is FREE and no ancestors are locked', () => {
      const modeMap: ModeMap = {
        'group-1': 'FREE',
      };
      const parentOf = (id: string) => (id === 'node-1' ? 'group-1' : null);
      const result = findHighestLockedAncestor('node-1', modeMap, parentOf);
      expect(result).toBeNull();
    });

    it('should handle root case (no parent)', () => {
      const modeMap: ModeMap = {};
      const parentOf = () => null;
      const result = findHighestLockedAncestor('root', modeMap, parentOf);
      expect(result).toBeNull();
    });
  });

  describe('getAncestorChainToLock', () => {
    it('should return empty array for root', () => {
      const parentOf = () => null;
      const result = getAncestorChainToLock('root', parentOf);
      expect(result).toEqual(['root']); // root is included in chain
    });

    it('should return single-item array for direct child of root', () => {
      const parentOf = (id: string) => (id === 'group-1' ? 'root' : null);
      const result = getAncestorChainToLock('group-1', parentOf);
      expect(result).toEqual(['group-1']);
    });

    it('should return full chain from scope to root (exclusive)', () => {
      const parentOf = (id: string) => {
        if (id === 'group-3') return 'group-2';
        if (id === 'group-2') return 'group-1';
        if (id === 'group-1') return 'root';
        return null;
      };
      const result = getAncestorChainToLock('group-3', parentOf);
      expect(result).toEqual(['group-3', 'group-2', 'group-1']);
    });

    it('should stop before root', () => {
      const parentOf = (id: string) => {
        if (id === 'group-1') return null; // root
        return null;
      };
      const result = getAncestorChainToLock('group-1', parentOf);
      expect(result).toEqual(['group-1']);
    });
  });

  describe('findTopMostLockedAncestor', () => {
    it('should return top-most locked ancestor in chain', () => {
      const modeMap: ModeMap = {
        'group-1': 'LOCK',
        'group-2': 'LOCK',
        'group-3': 'LOCK',
      };
      const parentOf = (id: string) => {
        if (id === 'group-3') return 'group-2';
        if (id === 'group-2') return 'group-1';
        if (id === 'group-1') return 'root';
        return null;
      };
      const result = findTopMostLockedAncestor('group-3', modeMap, parentOf);
      expect(result).toBe('group-1'); // Top-most (closest to root)
    });

    it('should return null if no locked ancestors in chain', () => {
      const modeMap: ModeMap = {
        'group-1': 'FREE',
        'group-2': 'FREE',
      };
      const parentOf = (id: string) => {
        if (id === 'group-2') return 'group-1';
        if (id === 'group-1') return 'root';
        return null;
      };
      const result = findTopMostLockedAncestor('group-2', modeMap, parentOf);
      expect(result).toBeNull();
    });

    it('should find existing locked ancestor higher than scope', () => {
      const modeMap: ModeMap = {
        'group-1': 'LOCK', // Already locked
        'group-2': 'FREE',
        'group-3': 'FREE',
      };
      const parentOf = (id: string) => {
        if (id === 'group-3') return 'group-2';
        if (id === 'group-2') return 'group-1';
        if (id === 'group-1') return 'root';
        return null;
      };
      const result = findTopMostLockedAncestor('group-3', modeMap, parentOf);
      expect(result).toBe('group-1');
    });
  });

  describe('shouldAutoLockForAI', () => {
    it('should return true for FREE scope', () => {
      const modeMap: ModeMap = { 'group-123': 'FREE' };
      const result = shouldAutoLockForAI('group-123', modeMap);
      expect(result).toBe(true);
    });

    it('should return true for scope not in modeMap (defaults to FREE)', () => {
      const modeMap: ModeMap = {};
      const result = shouldAutoLockForAI('group-123', modeMap);
      expect(result).toBe(true);
    });

    it('should return false for LOCK scope', () => {
      const modeMap: ModeMap = { 'group-123': 'LOCK' };
      const result = shouldAutoLockForAI('group-123', modeMap);
      expect(result).toBe(false);
    });
  });

  describe('buildModeMap', () => {
    it('should extract modes from ViewState.layout', () => {
      const viewState = {
        layout: {
          'root': { mode: 'FREE' },
          'group-1': { mode: 'LOCK' },
          'group-2': { mode: 'FREE' },
        }
      };
      const result = buildModeMap(viewState);
      expect(result).toEqual({
        'root': 'FREE',
        'group-1': 'LOCK',
        'group-2': 'FREE',
      });
    });

    it('should return empty map when ViewState.layout is missing', () => {
      const viewState = {};
      const result = buildModeMap(viewState);
      expect(result).toEqual({});
    });

    it('should return empty map when ViewState.layout is empty', () => {
      const viewState = {
        layout: {}
      };
      const result = buildModeMap(viewState);
      expect(result).toEqual({});
    });
  });

  describe('buildParentOf', () => {
    it('should return null for root', () => {
      const graph: ElkGraphNode = {
        id: 'root',
        children: [],
      };
      const parentOf = buildParentOf(graph);
      expect(parentOf('root')).toBeNull();
    });

    it('should return parent ID for child nodes', () => {
      const graph: ElkGraphNode = {
        id: 'root',
        children: [
          {
            id: 'group-1',
            children: [
              {
                id: 'node-1',
              },
            ],
          },
        ],
      };
      const parentOf = buildParentOf(graph);
      expect(parentOf('group-1')).toBe('root');
      expect(parentOf('node-1')).toBe('group-1');
    });

    it('should handle nested hierarchy', () => {
      const graph: ElkGraphNode = {
        id: 'root',
        children: [
          {
            id: 'group-1',
            children: [
              {
                id: 'group-2',
                children: [
                  {
                    id: 'node-1',
                  },
                ],
              },
            ],
          },
        ],
      };
      const parentOf = buildParentOf(graph);
      expect(parentOf('group-1')).toBe('root');
      expect(parentOf('group-2')).toBe('group-1');
      expect(parentOf('node-1')).toBe('group-2');
    });

    it('should return null for non-existent IDs', () => {
      const graph: ElkGraphNode = {
        id: 'root',
        children: [],
      };
      const parentOf = buildParentOf(graph);
      expect(parentOf('non-existent')).toBeNull();
    });
  });
});

