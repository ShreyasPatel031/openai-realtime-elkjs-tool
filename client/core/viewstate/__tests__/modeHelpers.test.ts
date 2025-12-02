/**
 * Mode Migration Helpers Tests
 */

import { 
  extractModeFromDomain, 
  getModeFromViewState, 
  setModeInViewState, 
  migrateModeDomainToViewState,
  buildModeMapFromViewState,
  buildModeMapDualRead
} from '../modeHelpers';
import type { ViewState } from '../ViewState';
import type { ElkGraphNode } from '../../../types/graph';

describe('modeHelpers', () => {
  const mockDomainGraph: ElkGraphNode = {
    id: 'root',
    children: [
      {
        id: 'group-1',
        mode: 'LOCK',
        children: [
          { id: 'node-1' }
        ]
      },
      {
        id: 'group-2',
        mode: 'FREE',
        children: [
          { id: 'node-2' }
        ]
      },
      {
        id: 'group-3',
        // No mode specified - should default to FREE
        children: [
          { id: 'node-3' }
        ]
      }
    ]
  };

  const mockViewState: ViewState = {
    node: {
      'node-1': { x: 100, y: 100 },
      'node-2': { x: 200, y: 200 },
      'node-3': { x: 300, y: 300 }
    },
    group: {
      'group-1': { x: 50, y: 50, w: 200, h: 100 },
      'group-2': { x: 150, y: 150, w: 200, h: 100 },
      'group-3': { x: 250, y: 250, w: 200, h: 100 }
    },
    edge: {},
    layout: {
      'group-1': { mode: 'LOCK' },
      'group-2': { mode: 'FREE' }
    }
  };

  describe('extractModeFromDomain', () => {
    it('should extract modes from all groups in Domain Graph', () => {
      const result = extractModeFromDomain(mockDomainGraph);
      expect(result).toEqual({
        'root': 'FREE', // root defaults to FREE
        'group-1': 'LOCK',
        'group-2': 'FREE',
        'group-3': 'FREE' // defaults to FREE when not specified
      });
    });
  });

  describe('getModeFromViewState', () => {
    it('should get mode from ViewState.layout', () => {
      expect(getModeFromViewState(mockViewState, 'group-1')).toBe('LOCK');
      expect(getModeFromViewState(mockViewState, 'group-2')).toBe('FREE');
    });

    it('should default to FREE when group not in ViewState', () => {
      expect(getModeFromViewState(mockViewState, 'nonexistent')).toBe('FREE');
    });

    it('should default to FREE when ViewState.layout is empty', () => {
      const emptyViewState: ViewState = { node: {}, group: {}, edge: {} };
      expect(getModeFromViewState(emptyViewState, 'group-1')).toBe('FREE');
    });
  });

  describe('setModeInViewState', () => {
    it('should set mode in ViewState.layout immutably', () => {
      const result = setModeInViewState(mockViewState, 'group-3', 'LOCK');
      
      expect(result.layout!['group-3']).toEqual({ mode: 'LOCK' });
      expect(result.layout!['group-1']).toEqual({ mode: 'LOCK' }); // preserved
      expect(result.layout!['group-2']).toEqual({ mode: 'FREE' }); // preserved
      
      // Original should be unchanged
      expect(mockViewState.layout!['group-3']).toBeUndefined();
    });

    it('should create layout section if missing', () => {
      const viewStateWithoutLayout: ViewState = { node: {}, group: {}, edge: {} };
      const result = setModeInViewState(viewStateWithoutLayout, 'group-1', 'LOCK');
      
      expect(result.layout).toEqual({
        'group-1': { mode: 'LOCK' }
      });
    });
  });

  describe('migrateModeDomainToViewState', () => {
    it('should migrate modes from Domain to ViewState when ViewState.layout is empty', () => {
      const viewStateWithoutLayout: ViewState = { 
        node: { 'node-1': { x: 100, y: 100 } }, 
        group: { 'group-1': { x: 50, y: 50 } }, 
        edge: {} 
      };
      
      const result = migrateModeDomainToViewState(mockDomainGraph, viewStateWithoutLayout);
      
      expect(result.layout).toEqual({
        'root': { mode: 'FREE' },
        'group-1': { mode: 'LOCK' },
        'group-2': { mode: 'FREE' },
        'group-3': { mode: 'FREE' }
      });
    });

    it('should not overwrite existing ViewState.layout', () => {
      const result = migrateModeDomainToViewState(mockDomainGraph, mockViewState);
      
      // Should preserve existing layout entries (not overwrite them)
      expect(result.layout!['group-1']).toEqual(mockViewState.layout!['group-1']);
      expect(result.layout!['group-2']).toEqual(mockViewState.layout!['group-2']);
      // But can add missing entries for groups that exist in domain
      expect(result.layout!['group-3']).toBeDefined();
      expect(result.layout!['root']).toBeDefined();
    });
  });

  describe('buildModeMapFromViewState', () => {
    it('should build ModeMap from ViewState.layout', () => {
      const result = buildModeMapFromViewState(mockViewState);
      
      expect(result).toEqual({
        'group-1': 'LOCK',
        'group-2': 'FREE'
      });
    });

    it('should return empty map when ViewState.layout is missing', () => {
      const viewStateWithoutLayout: ViewState = { node: {}, group: {}, edge: {} };
      const result = buildModeMapFromViewState(viewStateWithoutLayout);
      
      expect(result).toEqual({});
    });
  });

  describe('buildModeMapDualRead', () => {
    it('should prefer ViewState over Domain when ViewState has modes', () => {
      const result = buildModeMapDualRead(mockViewState, mockDomainGraph);
      
      expect(result).toEqual({
        'group-1': 'LOCK',
        'group-2': 'FREE'
      });
    });

    it('should fallback to Domain when ViewState has no modes', () => {
      const viewStateWithoutLayout: ViewState = { node: {}, group: {}, edge: {} };
      const result = buildModeMapDualRead(viewStateWithoutLayout, mockDomainGraph);
      
      expect(result).toEqual({
        'root': 'FREE',
        'group-1': 'LOCK',
        'group-2': 'FREE',
        'group-3': 'FREE'
      });
    });
  });
});


