import { useState, useEffect, useRef, useCallback } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  addNode as addNodeHelper,
  deleteNode as deleteNodeHelper,
  moveNode as moveNodeHelper,
  addEdge as addEdgeHelper,
  deleteEdge as deleteEdgeHelper,
  groupNodes as groupNodesHelper,
  removeGroup as removeGroupHelper,
  batchUpdate as batchUpdateHelper,
  ElkNode as HelperElkNode
} from '../utils/graph_helper_functions';

// Use the interface from graph_helper_functions instead of redefining it
export type ElkNode = HelperElkNode;

// Add any additional properties needed
export interface ExtendedElkNode extends ElkNode {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: any;
}

// Copy exact default options from ElkRender.tsx
const ROOT_DEFAULT_OPTIONS = {
  layoutOptions: {
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.considerModelOrder": true,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "elk.interactive": true,
    "elk.interactiveLayout": true,
    "elk.layered.priority.direction": 0,
    "org.eclipse.elk.debugMode": true,
    "elk.layered.crossingMinimization.forceNodeModelOrder": true,
    "elk.layered.priority.shortness": 100,  
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

const NON_ROOT_DEFAULT_OPTIONS = {
  width: 80,
  height: 50,
  layoutOptions: {
    "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
    "elk.padding": "[top=30.0,left=30.0,bottom=30.0,right=30.0]",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.priority.shortness": 100, 
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

// Initial ELK graph to use as default
const getInitialElkGraph = () => {
  return {
    "id": "root",
    "labels": [{ "text": "Root" }],
    "children": [
      { 
        "id": "ui",
        "labels": [{ "text": "UI" }],
        "children": [
          { 
            "id": "webapp",        
            "labels": [{ "text": "Web App" }]
          }
        ]
      },
      { 
        "id": "aws",
        "labels": [{ "text": "AWS" }],
        "children": [
          { 
            "id": "api",  
            "labels": [{ "text": "API" }]
          },
          { 
            "id": "lambda",
            "labels": [{ "text": "Lambda" }],
            "children": [
              { 
                "id": "query", 
                "labels": [{ "text": "Query" }]
              },
              { 
                "id": "pdf", 
                "labels": [{ "text": "PDF" }]
              },
              { 
                "id": "fetch", 
                "labels": [{ "text": "Fetch" }]
              },
              { 
                "id": "chat", 
                "labels": [{ "text": "Chat" }]
              }
            ],
            "edges": [
              { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ] }
            ]
          },
          { 
            "id": "vector", 
            "labels": [{ "text": "Vector" }]
          },
          { 
            "id": "storage", 
            "labels": [{ "text": "Storage" }]
          }
        ],
        "edges": [
          { "id": "e1", "sources": [ "api" ], "targets": ["lambda" ] },
          { "id": "e2", "sources": [ "query" ], "targets": ["vector" ] },
          { "id": "e3", "sources": [ "pdf" ], "targets": ["vector" ] },
          { "id": "e4", "sources": [ "pdf" ], "targets": ["storage" ] },
          { "id": "e5", "sources": [ "fetch" ], "targets": ["storage" ] }
        ]
      },
      { 
        "id": "openai", 
        "labels": [{ "text": "OpenAI" }],
        "children": [
          { 
            "id": "embed", 
            "labels": [{ "text": "Embed" }]
          },
          { 
            "id": "chat_api", 
            "labels": [{ "text": "Chat API" }]
          }
        ]
      }
    ],
    "edges": [
      { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ] },
      { "id": "e7", "sources": [ "chat" ], "targets": ["chat_api" ] },
      { 
        "id": "e8", 
        "sources": [ "embed" ], 
        "targets": [ "query" ],
      },
      { 
        "id": "e9", 
        "sources": [ "embed" ], 
        "targets": [ "pdf" ],
      }
    ]
  };
};

// Utility function to ensure IDs on a node
const ensureIds = (node: ExtendedElkNode, parentId: string = ''): ExtendedElkNode => {
  if (!node) return node;
  
  // Apply defaults directly to the node
  if (!parentId) {
    // Root node
    Object.assign(node, {
      ...ROOT_DEFAULT_OPTIONS,
      layoutOptions: {
        ...ROOT_DEFAULT_OPTIONS.layoutOptions,
        ...(node.layoutOptions || {})
      }
    });
  } else {
    // Non-root node - ensure width and height are set
    node.width = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
    node.height = node.height || NON_ROOT_DEFAULT_OPTIONS.height;
    node.layoutOptions = {
      ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions,
      ...(node.layoutOptions || {})
    };
  }

  if (!node.id) {
    node.id = `${parentId}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Update children recursively
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => ensureIds(child as ExtendedElkNode, node.id));
  }

  return node;
};

const useGraphManager = () => {
  const [elkGraph, setElkGraph] = useState<ExtendedElkNode>(getInitialElkGraph() as ExtendedElkNode);
  const [layoutedElk, setLayoutedElk] = useState<ExtendedElkNode | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const elk = new ELK();
  
  // Track the previous layouted graph for comparison
  const prevLayoutHash = useRef<string>('');
  const layoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Function to layout the graph with debouncing
  const layoutGraph = useCallback(async () => {
    try {
      if (!elkGraph) return;

      // Create a deep copy of the graph to avoid modifying the original
      const graphCopy = JSON.parse(JSON.stringify(elkGraph));
      
      // Apply defaults through ensureIds
      const graphWithOptions = ensureIds(graphCopy);
      
      // Generate a simple hash for comparison
      const currentHash = JSON.stringify({
        id: graphWithOptions.id,
        nodeCount: JSON.stringify(graphWithOptions).length
      });
      
      // Skip layout if the graph hasn't changed meaningfully
      if (currentHash === prevLayoutHash.current) {
        console.log('Graph structure unchanged, skipping layout');
        return;
      }
      
      // Store current hash for future comparison
      prevLayoutHash.current = currentHash;
      
      console.log('Laying out graph with options:', graphWithOptions);
      
      // Perform the layout
      const layoutResult = await elk.layout(graphWithOptions);
      console.log('Layout result:', layoutResult);
      
      setLayoutedElk(layoutResult as ExtendedElkNode);
      setLayoutVersion(prev => prev + 1);
    } catch (err) {
      console.error("Error laying out graph:", err);
    }
  }, [elkGraph, elk]);

  // Debounced layout effect
  useEffect(() => {
    // Clear any existing timeout
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current);
    }
    
    // Set a new timeout
    layoutTimeoutRef.current = setTimeout(() => {
      layoutGraph();
    }, 500); // 500ms debounce
    
    // Cleanup
    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
      }
    };
  }, [elkGraph, layoutGraph]);

  // Wrapper functions that maintain state
  const addNode = (nodeName: string, parentId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = addNodeHelper(nodeName, parentId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const deleteNode = (nodeId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = deleteNodeHelper(nodeId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const moveNode = (nodeId: string, newParentId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = moveNodeHelper(nodeId, newParentId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const addEdge = (edgeId: string, containerId: string | null, sourceId: string, targetId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = addEdgeHelper(edgeId, containerId, sourceId, targetId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const deleteEdge = (edgeId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = deleteEdgeHelper(edgeId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const groupNodes = (nodeIds: string[], parentId: string, groupId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = groupNodesHelper(nodeIds, parentId, groupId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const removeGroup = (groupId: string) => {
    setElkGraph(prevGraph => {
      const newGraph = removeGroupHelper(groupId, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const batchUpdate = (operations: Array<{name: string, args: any}>) => {
    setElkGraph(prevGraph => {
      const newGraph = batchUpdateHelper(operations, JSON.parse(JSON.stringify(prevGraph)));
      return newGraph as ExtendedElkNode;
    });
  };

  const resetGraph = () => {
    setElkGraph(getInitialElkGraph() as ExtendedElkNode);
    setLayoutedElk(null);
  };

  return {
    elkGraph,
    setElkGraph,
    layoutedElk,
    layoutVersion,
    addNode,
    deleteNode, 
    moveNode,
    addEdge,
    deleteEdge,
    groupNodes,
    removeGroup,
    batchUpdate,
    resetGraph,
  };
};

export default useGraphManager; 