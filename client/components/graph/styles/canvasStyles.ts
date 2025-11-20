/**
 * Centralized canvas styling configuration
 * Single source of truth for all ReactFlow canvas colors, sizes, and styles
 */
import React from 'react';

export const CANVAS_STYLES = {
  // Edge styles
  edges: {
    default: {
      stroke: '#bbb',
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

  // Node styles - SINGLE SOURCE OF TRUTH for all node/group visual states
  nodes: {
    // Default state
    default: {
      background: 'white',
      border: '1px solid #E4E4E4',
      borderRadius: '8px',
      boxShadow: 'none',
    },
    // Hover state
    hover: {
      border: '1px solid #D4D4DB',
      boxShadow: 'none',
    },
    // Selected state
    selected: {
      border: '1px solid #D4D4DB',
      boxShadow: 'none',
    },
    // Group styles
    group: {
      background: 'rgba(240, 240, 240, 0.5)',
      border: '#adb5bd',
      // Default group border (no group icon)
      defaultBorder: '1px dashed #adb5bd',
      // Group with icon border
      iconBorder: '2px solid #adb5bd',
      // Selected group border (no icon)
      selectedDefaultBorder: '2px dashed #D4D4DB',
      // Selected group with icon border
      selectedIconBorder: '3px solid #D4D4DB',
    },
  },

  // Z-index hierarchy (from highest to lowest)
  // 1. Dots (node handles) - always on top (CSS z-index within node)
  // 2. Edge labels - above edges but below dots
  // 3. Regular nodes - above edges so dots (inside nodes) are visible
  // 4. Edges - above groups so they're visible when connecting nodes
  // 5. Groups - lowest so edges connecting nodes within/across groups are visible
  zIndex: {
    // Node dots/handles (highest priority - CSS z-index within node)
    // Must be very high to ensure they appear above ReactFlow's edge SVG layer
    nodeDots: 10000,
    nodeDotsExpanded: 10001,
    nodeDotsHoverArea: 10000,
    // Edge labels (second priority)
    edgeLabels: 5000,
    // Regular nodes (must be above edges so dots render on top)
    nodes: 4000,
    selectedNodes: 4000,
    // Edges (above groups but below nodes)
    edges: 2000,
    selectedEdges: 2000,
    // Groups (lowest so edges are visible)
    groups: 1000,
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

/**
 * Get node style based on state - SINGLE SOURCE OF TRUTH for node styling
 * @param isSelected - Whether the node is selected
 * @param isHovered - Whether the node is hovered (optional, for future use)
 * @param isInsideSelectedGroup - Whether node is inside a selected group (optional)
 */
export const getNodeStyle = (
  isSelected: boolean,
  isHovered: boolean = false,
  isInsideSelectedGroup: boolean = false
): React.CSSProperties => {
  const baseStyle = CANVAS_STYLES.nodes.default;
  
  // Priority: selected > hover > default
  if (isSelected || isInsideSelectedGroup) {
    return {
      ...baseStyle,
      border: CANVAS_STYLES.nodes.selected.border,
      boxShadow: CANVAS_STYLES.nodes.selected.boxShadow,
    };
  }
  
  if (isHovered) {
    return {
      ...baseStyle,
      border: CANVAS_STYLES.nodes.hover.border,
      boxShadow: CANVAS_STYLES.nodes.hover.boxShadow,
    };
  }
  
  return baseStyle;
};

/**
 * Get group border style - SINGLE SOURCE OF TRUTH for group border styling
 * @param isSelected - Whether the group is selected
 * @param hasGroupIcon - Whether the group has a group icon
 * @param customBorderColor - Custom border color from group data (optional)
 */
export const getGroupBorderStyle = (
  isSelected: boolean,
  hasGroupIcon: boolean,
  customBorderColor?: string
): string => {
  const defaultColor = customBorderColor || CANVAS_STYLES.nodes.group.border;
  const selectedColor = '#D4D4DB';
  
  if (hasGroupIcon) {
    // Group with icon: solid border
    return isSelected 
      ? `3px solid ${selectedColor}`
      : `2px solid ${defaultColor}`;
  } else {
    // Group without icon: dashed border
    return isSelected
      ? CANVAS_STYLES.nodes.group.selectedDefaultBorder
      : CANVAS_STYLES.nodes.group.defaultBorder.replace('#adb5bd', defaultColor);
  }
};
