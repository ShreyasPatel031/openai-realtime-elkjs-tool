/**
 * Centralized canvas styling configuration
 * Single source of truth for all ReactFlow canvas colors, sizes, and styles
 */

export const CANVAS_STYLES = {
  // Edge styles
  edges: {
    default: {
      stroke: '#999',
      strokeWidth: 2,
      opacity: 1,
    },
    selected: {
      strokeDasharray: '5,5', // Dotted pattern when selected
    },
    connected: {
      stroke: '#0066cc', // Blue when connected to selected nodes
      strokeWidth: 2,
      animated: true,
    },
    marker: {
      color: '#555',
      width: 20,
      height: 20,
    },
  },

  // Node styles
  nodes: {
    selected: {
      // Node selection styles can be added here
    },
  },

  // Z-index hierarchy
  zIndex: {
    edges: 1000,
    selectedEdges: 3000,
    edgeLabels: 5000,
    nodes: 2000,
    selectedNodes: 4000,
  },

  // Canvas background and viewport
  canvas: {
    background: {
      light: 'bg-gray-50',
      dark: 'bg-gray-950',
    },
    zoom: {
      min: 0.2,
      max: 3,
      default: 1,
    },
    viewport: {
      default: { x: 0, y: 0, zoom: 1 },
    },
  },
} as const;

// Helper functions for dynamic styling
export const getEdgeStyle = (isSelected: boolean, isConnected: boolean) => ({
  ...CANVAS_STYLES.edges.default,
  ...(isSelected && CANVAS_STYLES.edges.selected),
  ...(isConnected && {
    stroke: CANVAS_STYLES.edges.connected.stroke,
    strokeWidth: CANVAS_STYLES.edges.connected.strokeWidth,
  }),
});

export const getEdgeZIndex = (isSelected: boolean) => 
  isSelected ? CANVAS_STYLES.zIndex.selectedEdges : CANVAS_STYLES.zIndex.edges;
