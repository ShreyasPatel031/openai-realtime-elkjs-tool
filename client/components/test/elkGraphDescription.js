/**
 * Helper functions to convert OpenAI-style function trees to ELK-compatible graph format.
 */

/**
 * Takes a function call tree in OpenAI format and converts it to an ELK graph.
 * 
 * @param {Object} functionCall - An OpenAI function call object or tree of function calls
 * @returns {Object} - An ELK-compatible graph object
 */
export function createElkGraphFromFunctionCall(functionCall) {
  // Create the root node (main graph container)
  const graph = {
    id: "root",
    layoutOptions: {
      'algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: [],
    edges: []
  };

  // Process the function call tree
  processNode(functionCall, graph, 'root');
  
  return graph;
}

/**
 * Helper to recursively process nodes in the function call tree
 */
function processNode(node, parentGraph, prefix) {
  if (!node) return;
  
  // Create node ID
  const nodeId = `${prefix}-${node.name || 'anonymous'}`;
  
  // Create and add the node to the parent graph
  const elkNode = {
    id: nodeId,
    labels: [{ text: node.name || 'function' }],
    children: [],
    edges: []
  };
  
  parentGraph.children.push(elkNode);
  
  // If there are nested function calls, process them recursively
  if (node.function_call) {
    const childId = `${nodeId}-child`;
    
    // Add an edge from parent to child
    elkNode.edges.push({
      id: `${nodeId}-to-${childId}`,
      sources: [nodeId],
      targets: [childId]
    });
    
    processNode(node.function_call, elkNode, nodeId);
  }
} 