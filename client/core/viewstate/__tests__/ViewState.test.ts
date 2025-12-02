/**
 * Tests for ViewState helpers
 * Part of Agent B Inter Plan - B2
 */

import {
  createEmptyViewState,
  requireGeometry,
  getGeometry,
  type ViewState,
} from '../ViewState';

describe('ViewState', () => {
  describe('createEmptyViewState', () => {
    it('should create empty ViewState with all stores', () => {
      const empty = createEmptyViewState();
      expect(empty).toEqual({
        node: {},
        group: {},
        edge: {},
        layout: {},
      });
    });

    it('should create independent instances', () => {
      const vs1 = createEmptyViewState();
      const vs2 = createEmptyViewState();
      vs1.node!['test'] = { x: 1, y: 1 };
      expect(vs2.node).toEqual({});
    });
  });

  describe('requireGeometry', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 10, y: 20, w: 96, h: 96 },
        'node-2': { x: 0, y: 0 }, // Valid but at origin
      },
      group: {
        'group-1': { x: 100, y: 200, w: 288, h: 288 },
      },
      edge: {},
    };

    it('should return geometry when present', () => {
      const geom = requireGeometry('node', 'node-1', viewState);
      expect(geom).toEqual({ x: 10, y: 20, w: 96, h: 96 });
    });

    it('should return geometry for groups', () => {
      const geom = requireGeometry('group', 'group-1', viewState);
      expect(geom).toEqual({ x: 100, y: 200, w: 288, h: 288 });
    });

    it('should accept geometry at origin', () => {
      const geom = requireGeometry('node', 'node-2', viewState);
      expect(geom).toEqual({ x: 0, y: 0 });
    });

    it('should throw in dev mode when geometry missing', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => {
        requireGeometry('node', 'missing-node', viewState);
      }).toThrow(/Missing geometry for node "missing-node"/);

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw in dev mode when geometry has invalid coordinates', () => {
      const invalidState: ViewState = {
        node: {
          'bad-node': { x: NaN, y: 20 },
        },
        group: {},
        edge: {},
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => {
        requireGeometry('node', 'bad-node', invalidState);
      }).toThrow(/Missing geometry/);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return safe default in production when missing', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const geom = requireGeometry('node', 'missing-node', viewState);
      expect(geom).toEqual({ x: 0, y: 0, w: 0, h: 0 });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing geometry for node "missing-node"')
      );

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('getGeometry', () => {
    const viewState: ViewState = {
      node: {
        'node-1': { x: 10, y: 20 },
      },
      group: {},
      edge: {},
    };

    it('should return geometry when present', () => {
      const geom = getGeometry('node', 'node-1', viewState);
      expect(geom).toEqual({ x: 10, y: 20 });
    });

    it('should return undefined when missing', () => {
      const geom = getGeometry('node', 'missing', viewState);
      expect(geom).toBeUndefined();
    });

    it('should return undefined for groups when missing', () => {
      const geom = getGeometry('group', 'missing-group', viewState);
      expect(geom).toBeUndefined();
    });
  });
});





