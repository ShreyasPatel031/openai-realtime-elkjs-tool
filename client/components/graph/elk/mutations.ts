import { findNodeById } from "../utils";

// Add a node to the graph
export const addNode = (nodeName: string, parentId: string, graph: any) => {
  // Find the parent node
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Create the new node
  const newNode = {
    id: nodeName,
    labels: [{ text: nodeName }]
  };
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Add the new node to the parent's children
  parentNode.children.push(newNode);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Delete a node from the graph
export const deleteNode = (nodeId: string, graph: any) => {
  // Recursive function to find and remove the node
  const removeNodeFromChildren = (children: any[], nodeId: string): boolean => {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === nodeId) {
        // Remove the node
        children.splice(i, 1);
        return true;
      }
      if (child.children) {
        if (removeNodeFromChildren(child.children, nodeId)) {
          return true;
        }
      }
    }
    return false;
  };
  
  // Start the search from the root's children
  if (!graph.children) {
    throw new Error('Graph has no children');
  }
  
  const nodeRemoved = removeNodeFromChildren(graph.children, nodeId);
  if (!nodeRemoved) {
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  // Remove any edges that reference this node
  const removeEdgesWithNode = (node: any, nodeId: string) => {
    if (node.edges) {
      node.edges = node.edges.filter((edge: any) => {
        return !edge.sources.includes(nodeId) && !edge.targets.includes(nodeId);
      });
    }
    if (node.children) {
      node.children.forEach((child: any) => removeEdgesWithNode(child, nodeId));
    }
  };
  
  removeEdgesWithNode(graph, nodeId);
  
  // Also clean up root-level edges
  if (graph.edges) {
    graph.edges = graph.edges.filter((edge: any) => {
      return !edge.sources.includes(nodeId) && !edge.targets.includes(nodeId);
    });
  }
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Move a node to a different parent
export const moveNode = (nodeId: string, newParentId: string, graph: any) => {
  // Find the node to move
  let nodeToMove: any = null;
  let oldParent: any = null;
  let oldParentChildren: any[] = [];
  
  const findNodeAndParent = (node: any, parent: any, nodeId: string) => {
    if (!node.children) return false;
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.id === nodeId) {
        nodeToMove = child;
        oldParent = node;
        oldParentChildren = node.children;
        return true;
      }
      if (child.children && findNodeAndParent(child, node, nodeId)) {
        return true;
      }
    }
    return false;
  };
  
  findNodeAndParent(graph, null, nodeId);
  
  if (!nodeToMove) {
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  // Find the new parent
  const newParent = findNodeById(graph, newParentId);
  if (!newParent) {
    throw new Error(`New parent node '${newParentId}' not found`);
  }
  
  // Remove node from old parent
  oldParentChildren.splice(oldParentChildren.indexOf(nodeToMove), 1);
  
  // Add node to new parent
  if (!newParent.children) {
    newParent.children = [];
  }
  newParent.children.push(nodeToMove);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Add an edge between nodes
export const addEdge = (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => {
  // Find the source and target nodes
  const sourceNode = findNodeById(graph, sourceId);
  const targetNode = findNodeById(graph, targetId);
  
  if (!sourceNode) {
    throw new Error(`Source node '${sourceId}' not found`);
  }
  if (!targetNode) {
    throw new Error(`Target node '${targetId}' not found`);
  }
  
  // Find the lowest common ancestor to place the edge
  const getNodePath = (node: any, id: string, path: any[] = []): any[] | null => {
    if (node.id === id) {
      return [...path, node];
    }
    if (!node.children) {
      return null;
    }
    for (let child of node.children) {
      const result = getNodePath(child, id, [...path, node]);
      if (result) {
        return result;
      }
    }
    return null;
  };
  
  const sourcePath = getNodePath(graph, sourceId, []);
  const targetPath = getNodePath(graph, targetId, []);
  
  if (!sourcePath || !targetPath) {
    throw new Error('Could not determine paths to nodes');
  }
  
  // Find the lowest common ancestor
  let commonAncestorIndex = 0;
  while (
    commonAncestorIndex < sourcePath.length &&
    commonAncestorIndex < targetPath.length &&
    sourcePath[commonAncestorIndex].id === targetPath[commonAncestorIndex].id
  ) {
    commonAncestorIndex++;
  }
  
  const commonAncestor = containerId ? 
    findNodeById(graph, containerId) : 
    sourcePath[commonAncestorIndex - 1] || graph;
  
  // Create the edge object
  const newEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Add the edge to the common ancestor
  if (!commonAncestor.edges) {
    commonAncestor.edges = [];
  }
  
  commonAncestor.edges.push(newEdge);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Delete an edge
export const deleteEdge = (edgeId: string, graph: any) => {
  // Recursive function to find and remove the edge
  const removeEdgeFromNode = (node: any, edgeId: string): boolean => {
    if (node.edges) {
      const initialLength = node.edges.length;
      node.edges = node.edges.filter((edge: any) => edge.id !== edgeId);
      if (node.edges.length < initialLength) {
        return true;
      }
    }
    
    if (node.children) {
      for (let child of node.children) {
        if (removeEdgeFromNode(child, edgeId)) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Try to remove from root level
  if (graph.edges) {
    const initialLength = graph.edges.length;
    graph.edges = graph.edges.filter((edge: any) => edge.id !== edgeId);
    if (graph.edges.length < initialLength) {
      return JSON.parse(JSON.stringify(graph)); // Edge found and removed
    }
  }
  
  // If not found at root, search through all nodes
  const edgeRemoved = removeEdgeFromNode(graph, edgeId);
  if (!edgeRemoved) {
    throw new Error(`Edge '${edgeId}' not found`);
  }
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Group nodes together
export const groupNodes = (nodeIds: string[], parentId: string, groupId: string, graph: any) => {
  // Find the parent node
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Create the new group node
  const groupNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [] as any[]
  };
  
  // Move each node to the group
  for (const nodeId of nodeIds) {
    let found = false;
    
    // Find the node and move it
    for (let i = 0; i < parentNode.children.length; i++) {
      if (parentNode.children[i].id === nodeId) {
        groupNode.children.push(parentNode.children[i]);
        parentNode.children.splice(i, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      throw new Error(`Node '${nodeId}' not found in parent '${parentId}'`);
    }
  }
  
  // Add the group node to the parent
  parentNode.children.push(groupNode);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
};

// Remove a group, moving its children to the parent
export const removeGroup = (groupId: string, graph: any) => {
  // Find the group and its parent
  let groupNode: any = null;
  let parentNode: any = null;
  
  const findGroupAndParent = (node: any, parent: any, groupId: string): boolean => {
    if (!node.children) return false;
    
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.id === groupId) {
        groupNode = child;
        parentNode = node;
        return true;
      }
      if (child.children && findGroupAndParent(child, node, groupId)) {
        return true;
      }
    }
    return false;
  };
  
  findGroupAndParent(graph, null, groupId);
  
  if (!groupNode) {
    throw new Error(`Group '${groupId}' not found`);
  }
  
  // Get the index of the group in the parent
  const groupIndex = parentNode.children.indexOf(groupNode);
  
  // Get the children of the group
  const groupChildren = groupNode.children || [];
  
  // Replace the group with its children
  parentNode.children.splice(groupIndex, 1, ...groupChildren);
  
  return JSON.parse(JSON.stringify(graph)); // Return a deep copy
}; 