/**
 *  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *  ┃  **DATA LAYERS – READ ME BEFORE EDITING**                    ┃
 *  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
 *  ┃  1. domain-graph (graph/*)                                   ┃
 *  ┃     - pure ELK JSON                                           ┃
 *  ┃     - NO x/y/sections/width/height/etc                        ┃
 *  ┃                                                               ┃
 *  ┃  2. processed-graph (ensureIds + elkOptions)                  ┃
 *  ┃     - lives only inside hooks/layout funcs                    ┃
 *  ┃     - generated, never mutated manually                       ┃
 *  ┃                                                               ┃
 *  ┃  3. view-graph (ReactFlow nodes/edges)                        ┃
 *  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 */

import { ElkGraphNode, NodeID, EdgeID, createNodeID, createEdgeID } from "../../types/graph";
import { RawGraph } from "./types/index";

// Helper to find a node by ID
const findNodeById = (node: ElkGraphNode, id: NodeID): ElkGraphNode | null => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
};

const notFound = (type: "node"|"edge"|"shape", id: string) =>
  console.error(`❌ ${type} '${id}' not found – caller / stack:`, new Error().stack);

// Add a new node under a parent
export const addNode = (nodeName: string, parentId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] addNode '${nodeName}' → parent '${parentId}'`);
  console.time("addNode");
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    notFound("node", parentId);
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Create the new node
  const newNode: ElkGraphNode = {
    id: createNodeID(nodeName),
    labels: [{ text: nodeName }]
  };
  
  // Add to parent
  parentNode.children.push(newNode);
  
  console.timeEnd("addNode");
  console.groupEnd();
  return graph;
};

// Delete a node and its edges
export const deleteNode = (nodeId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] deleteNode '${nodeId}'`);
  console.time("deleteNode");
  const deleteNodeFromParent = (parent: ElkGraphNode, id: NodeID): boolean => {
    if (!parent.children) return false;
    
    const index = parent.children.findIndex(child => child.id === id);
    if (index >= 0) {
      parent.children.splice(index, 1);
      return true;
    }
    
    for (const child of parent.children) {
      if (deleteNodeFromParent(child, id)) return true;
    }
    
    return false;
  };
  
  if (!deleteNodeFromParent(graph, nodeId)) {
    notFound("node", nodeId);
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  console.timeEnd("deleteNode");
  console.groupEnd();
  return graph;
};

// Move a node to a new parent
export const moveNode = (nodeId: NodeID, newParentId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] moveNode '${nodeId}' → new parent '${newParentId}'`);
  console.time("moveNode");
  const node = findNodeById(graph, nodeId);
  if (!node) {
    notFound("node", nodeId);
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  const newParent = findNodeById(graph, newParentId);
  if (!newParent) {
    notFound("node", newParentId);
    throw new Error(`New parent node '${newParentId}' not found`);
  }
  
  // Remove from old parent
  const removeFromParent = (parent: ElkGraphNode, id: NodeID): boolean => {
    if (!parent.children) return false;
    
    const index = parent.children.findIndex(child => child.id === id);
    if (index >= 0) {
      const [movedNode] = parent.children.splice(index, 1);
      // Add to new parent
      if (!newParent.children) newParent.children = [];
      newParent.children.push(movedNode);
      return true;
    }
    
    for (const child of parent.children) {
      if (removeFromParent(child, id)) return true;
    }
    
    return false;
  };
  
  if (!removeFromParent(graph, nodeId)) {
    throw new Error(`Failed to move node '${nodeId}'`);
  }
  
  console.timeEnd("moveNode");
  console.groupEnd();
  return graph;
};

// Add an edge between nodes
export const addEdge = (edgeId: EdgeID, containerId: NodeID | null, sourceId: NodeID, targetId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] addEdge '${edgeId}' (${sourceId} → ${targetId})`);
  console.time("addEdge");
  const container = containerId ? findNodeById(graph, containerId) : graph;
  if (!container) {
    notFound("node", containerId?.toString() || "null");
    throw new Error(`Container '${containerId}' not found`);
  }
  
  // Ensure container has edges array
  if (!container.edges) {
    container.edges = [];
  }
  
  // Create the edge
  const newEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Add to container
  container.edges.push(newEdge);
  
  console.timeEnd("addEdge");
  console.groupEnd();
  return graph;
};

// Delete an edge
export const deleteEdge = (edgeId: EdgeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] deleteEdge '${edgeId}'`);
  console.time("deleteEdge");
  const deleteEdgeFromNode = (node: ElkGraphNode, id: EdgeID): boolean => {
    if (node.edges) {
      const index = node.edges.findIndex(edge => edge.id === id);
      if (index >= 0) {
        node.edges.splice(index, 1);
        return true;
      }
    }
    
    if (node.children) {
      for (const child of node.children) {
        if (deleteEdgeFromNode(child, id)) return true;
      }
    }
    
    return false;
  };
  
  if (!deleteEdgeFromNode(graph, edgeId)) {
    notFound("edge", edgeId);
    throw new Error(`Edge '${edgeId}' not found`);
  }
  
  console.timeEnd("deleteEdge");
  console.groupEnd();
  return graph;
};

// Group nodes together
export const groupNodes = (nodeIds: NodeID[], parentId: NodeID, groupId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] groupNodes '${groupId}' (${nodeIds.length} nodes) → parent '${parentId}'`);
  console.time("groupNodes");
  // Find the parent node
  const parentNode = findNodeById(graph, parentId);
  if (!parentNode) {
    notFound("node", parentId);
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  // Ensure parent has a children array
  if (!parentNode.children) {
    parentNode.children = [];
  }
  
  // Create the new group node
  const groupNode: ElkGraphNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: []
  };
  
  // Move each node to the group
  for (const nodeId of nodeIds) {
    let found = false;
    
    // Find the node and move it
    for (let i = 0; i < parentNode.children.length; i++) {
      if (parentNode.children[i].id === nodeId) {
        groupNode.children!.push(parentNode.children[i]);
        parentNode.children.splice(i, 1);
        found = true;
        break;
      }
    }
    
    if (!found) {
      notFound("node", nodeId);
      throw new Error(`Node '${nodeId}' not found in parent '${parentId}'`);
    }
  }
  
  // Add the group node to the parent
  parentNode.children.push(groupNode);
  
  console.timeEnd("groupNodes");
  console.groupEnd();
  return graph;
};

// Remove a group, moving its children to the parent
export const removeGroup = (groupId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] removeGroup '${groupId}'`);
  console.time("removeGroup");
  // Find the group and its parent
  let groupNode: ElkGraphNode | null = null;
  let parentNode: ElkGraphNode | null = null;
  
  const findGroupAndParent = (node: ElkGraphNode, parent: ElkGraphNode | null, groupId: NodeID): boolean => {
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
    notFound("node", groupId);
    throw new Error(`Group '${groupId}' not found`);
  }
  
  // Get the index of the group in the parent
  const groupIndex = parentNode!.children!.indexOf(groupNode);
  
  // Get the children of the group
  const groupChildren = (groupNode as ElkGraphNode).children || [];
  
  // Replace the group with its children
  parentNode!.children!.splice(groupIndex, 1, ...groupChildren);
  
  console.timeEnd("removeGroup");
  console.groupEnd();
  return graph;
};

export const batchUpdate = (operations: Array<{
  name: string;
  nodename?: string;
  parentId?: NodeID;
  nodeId?: NodeID;
  newParentId?: NodeID;
  edgeId?: EdgeID;
  sourceId?: NodeID;
  targetId?: NodeID;
  nodeIds?: NodeID[];
  groupId?: NodeID;
}>, graph: RawGraph) => {
  let updatedGraph = { ...graph };
  
  for (const operation of operations) {
    const { name, ...args } = operation;
    
    switch (name) {
      case "add_node":
        updatedGraph = addNode(args.nodename!, args.parentId!, updatedGraph);
        break;
        
      case "delete_node":
        updatedGraph = deleteNode(args.nodeId!, updatedGraph);
        break;
        
      case "move_node":
        updatedGraph = moveNode(args.nodeId!, args.newParentId!, updatedGraph);
        break;
        
      case "add_edge":
        updatedGraph = addEdge(args.edgeId!, null, args.sourceId!, args.targetId!, updatedGraph);
        break;
        
      case "delete_edge":
        updatedGraph = deleteEdge(args.edgeId!, updatedGraph);
        break;
        
      case "group_nodes":
        updatedGraph = groupNodes(args.nodeIds!, args.parentId!, args.groupId!, updatedGraph);
        break;
        
      case "remove_group":
        updatedGraph = removeGroup(args.groupId!, updatedGraph);
        break;
        
      default:
        console.warn(`Unknown operation: ${name}`);
    }
  }
  
  return updatedGraph;
}; 