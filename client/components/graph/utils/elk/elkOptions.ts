export const ROOT_DEFAULT_OPTIONS = {
  layoutOptions: {
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    // "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.considerModelOrder": true,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.edgeEdgeBetweenLayers": 30,
    "spacing.nodeNodeBetweenLayers": 30,
    "spacing.edgeNodeBetweenLayers": 30,

  }
};

export const NON_ROOT_DEFAULT_OPTIONS = {
  width: 100,
  height: 100,
  layoutOptions: {
    "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
    "elk.padding": "[top=30.0,left=30.0,bottom=30.0,right=30.0]",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.priority.shortness": 100, 
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.edgeEdgeBetweenLayers": 50,
    "spacing.nodeNodeBetweenLayers": 50,
    "spacing.edgeNodeBetweenLayers": 50,
    // Enable edge label placement
    "edgeLabels.placement": "CENTER",
    "elk.edgeLabels.inline": true,
  }
}; 