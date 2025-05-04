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

import { ElkGraphNode, ElkGraphEdge, NodeID, EdgeID, createNodeID, createEdgeID } from "../../types/graph";
import { RawGraph } from "./types/index";

// ──────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Recursively finds a node by its id.
 */
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

/**
 * Recursively finds the parent of a node by its id.
 */
const findParentOfNode = (
  root: ElkGraphNode,
  id: NodeID,
  parent: ElkGraphNode | null = null
): ElkGraphNode | null => {
  if (root.id === id) return parent;
  if (root.children) {
    for (const child of root.children) {
      const result = findParentOfNode(child, id, root);
      if (result) return result;
    }
  }
  return null;
};

/**
 * Get the path from the root to a target node.
 */
const getPathToNode = (
  node: ElkGraphNode,
  nodeId: NodeID,
  path: ElkGraphNode[] = []
): ElkGraphNode[] | null => {
  if (node.id === nodeId) return [...path, node];
  if (node.children) {
    for (const child of node.children) {
      const result = getPathToNode(child, nodeId, [...path, node]);
      if (result) return result;
    }
  }
  return null;
};

/**
 * Find the common ancestor of two nodes.
 */
const findCommonAncestor = (
  layout: ElkGraphNode,
  id1: NodeID,
  id2: NodeID
): ElkGraphNode | null => {
  console.time("findCommonAncestor");
  const path1 = getPathToNode(layout, id1);
  const path2 = getPathToNode(layout, id2);
  if (!path1 || !path2) return null;
  let common: ElkGraphNode | null = null;
  for (let i = 0; i < Math.min(path1.length, path2.length); i++) {
    if (path1[i].id === path2[i].id) {
      common = path1[i];
    } else {
      break;
    }
  }
  console.timeEnd("findCommonAncestor");
  return common;
};

/**
 * Used to hold edge arrays during traversal.
 */
interface EdgeCollection {
  edgeArr: ElkGraphEdge[];
  parent: ElkGraphNode;
}

/**
 * Recursively traverses the layout and collects all edge arrays with their parent node.
 */
const collectEdges = (node: ElkGraphNode, collection: EdgeCollection[] = []): EdgeCollection[] => {
  if (node.edges) {
    collection.push({ edgeArr: node.edges, parent: node });
  }
  if (node.children) {
    for (const child of node.children) {
      collectEdges(child, collection);
    }
  }
  return collection;
};

/**
 * Reattaches edges involving a moved node so that each edge is placed
 * under the common ancestor of its endpoints.
 */
const updateEdgesForNode = (nodeId: NodeID, layout: ElkGraphNode): ElkGraphNode => {
  console.time("updateEdgesForNode");
  const allEdges = collectEdges(layout);
  for (const { edgeArr, parent } of allEdges) {
    // Loop backwards in case we need to remove any edges.
    for (let i = edgeArr.length - 1; i >= 0; i--) {
      const edge = edgeArr[i];
      if (edge.sources.includes(nodeId) || edge.targets.includes(nodeId)) {
        // For simplicity, assume one source and one target per edge.
        const sourceId = edge.sources[0];
        const targetId = edge.targets[0];
        const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
        if (commonAncestor && (!parent || parent.id !== commonAncestor.id)) {
          // Remove the edge from the current parent's edge list.
          edgeArr.splice(i, 1);
          if (!commonAncestor.edges) commonAncestor.edges = [];
          commonAncestor.edges.push(edge);
        }
      }
    }
  }
  console.timeEnd("updateEdgesForNode");
  return layout;
};


const rehomeEdgesForSubtree = (n: ElkGraphNode, root: ElkGraphNode) => {
  const dfs = (curr: ElkGraphNode) => {
    // one pass lifts each edge at most one level
    let movedSomething = false;
    collectEdges(root).forEach(({ edgeArr, parent }) => {
      for (let i = edgeArr.length - 1; i >= 0; i--) {
        const e = edgeArr[i];
        if (e.sources.includes(curr.id) || e.targets.includes(curr.id)) {
          const ca = findCommonAncestor(root, e.sources[0], e.targets[0]);
          if (ca && ca.id !== parent.id) {
            edgeArr.splice(i, 1);
            (ca.edges ??= []).push(e);
            movedSomething = true;
          }
        }
      }
    });
    // keep bubbling until nothing moves
    if (movedSomething) dfs(curr);
    (curr.children ?? []).forEach(c => rehomeEdgesForSubtree(c, root));
  };
  dfs(n);
};

// Logging helper
const notFound = (type: "node"|"edge"|"shape", id: string) =>
  console.error(`❌ ${type} '${id}' not found – caller / stack:`, new Error().stack);

// ──────────────────────────────────────────────
// PRIMITIVE OPERATIONS
// ──────────────────────────────────────────────

//
// 🟩 NODE OPERATIONS
//

/**
 * Add a new node under a parent
 */
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
  
  // Create the new node - using createNodeID to maintain ID creation consistency
  const newNode: ElkGraphNode = {
    id: createNodeID(nodeName),
    labels: [{ text: nodeName }],
    children: []
  };
  
  // Add to parent
  parentNode.children.push(newNode);
  
  console.timeEnd("addNode");
  console.groupEnd();
  return graph;
};

/**
 * Delete a node and all its related edges
 */
export const deleteNode = (nodeId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] deleteNode '${nodeId}'`);
  console.time("deleteNode");
  
  // First, find and remove the node from its parent
  const parent = findParentOfNode(graph, nodeId);
  if (!parent || !parent.children) {
    notFound("node", nodeId);
    throw new Error(`Node '${nodeId}' not found or trying to remove root`);
  }
  
  parent.children = parent.children.filter(child => child.id !== nodeId);

  // Function to remove edges related to the deleted node
  function removeEdges(node: ElkGraphNode): void {
    if (node.edges) {
      node.edges = node.edges.filter(edge => 
        !edge.sources.includes(nodeId) && !edge.targets.includes(nodeId)
      );
    }
    if (node.children) {
      for (const child of node.children) {
        removeEdges(child);
      }
    }
  }

  // Remove edges from all levels of the graph
  removeEdges(graph);
  
  console.timeEnd("deleteNode");
  console.groupEnd();
  return graph;
};

/**
 * Move a node to a new parent and correctly update all edges.
 */
export const moveNode = (nodeId: NodeID, newParentId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] moveNode '${nodeId}' → new parent '${newParentId}'`);
  console.time("moveNode");
  
  const node = findNodeById(graph, nodeId);
  const newParent = findNodeById(graph, newParentId);
  
  if (!node) {
    notFound("node", nodeId);
    throw new Error(`Node '${nodeId}' not found`);
  }
  
  if (!newParent) {
    notFound("node", newParentId);
    throw new Error(`New parent node '${newParentId}' not found`);
  }
  
  const oldParent = findParentOfNode(graph, nodeId);
  if (!oldParent || !oldParent.children) {
    throw new Error(`Node '${nodeId}' not found in any parent`);
  }
  
  // Remove the node from its old parent
  oldParent.children = oldParent.children.filter(child => child.id !== nodeId);
  
  // Add the node to the new parent
  if (!newParent.children) newParent.children = [];
  newParent.children.push(node);
  
  // Update edge connections - this is the key improvement
  const updatedGraph = updateEdgesForNode(nodeId, graph);
  rehomeEdgesForSubtree(node, graph);
  
  console.timeEnd("moveNode");
  console.groupEnd();
  return updatedGraph;
};

//
// 🟧 EDGE OPERATIONS
//

/**
 * Add an edge between nodes at the common ancestor level
 */
export const addEdge = (edgeId: EdgeID, containerId: NodeID | null, sourceId: NodeID, targetId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] addEdge '${edgeId}' (${sourceId} → ${targetId})`);
  console.time("addEdge");
  
  // Find the common ancestor for edge placement - KEY IMPROVEMENT
  const commonAncestor = findCommonAncestor(graph, sourceId, targetId);
  
  if (!commonAncestor) {
    console.error(`Common ancestor not found for nodes: ${sourceId}, ${targetId}`);
    throw new Error(`Common ancestor not found for connected nodes`);
  }
  
  // Create the edge
  const newEdge: ElkGraphEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Ensure the common ancestor has edges array
  if (!commonAncestor.edges) {
    commonAncestor.edges = [];
  }
  
  // Add the edge to the common ancestor
  commonAncestor.edges.push(newEdge);
  
  console.timeEnd("addEdge");
  console.groupEnd();
  return graph;
};

/**
 * Delete an edge from the layout.
 */
export const deleteEdge = (edgeId: EdgeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] deleteEdge '${edgeId}'`);
  console.time("deleteEdge");
  
  let edgeFound = false;
  
  function removeEdge(node: ElkGraphNode): void {
    if (node.edges) {
      const initialLength = node.edges.length;
      node.edges = node.edges.filter(edge => edge.id !== edgeId);
      if (node.edges.length < initialLength) {
        edgeFound = true;
      }
    }
    if (node.children) {
      for (const child of node.children) {
        removeEdge(child);
      }
    }
  }
  
  removeEdge(graph);
  
  if (!edgeFound) {
    notFound("edge", edgeId);
    throw new Error(`Edge '${edgeId}' not found`);
  }
  
  console.timeEnd("deleteEdge");
  console.groupEnd();
  return graph;
};

//
// 🟦 GROUP OPERATIONS
//

/**
 * Creates a new group node and moves specified nodes into it,
 * properly handling edge reattachment.
 */
export const groupNodes = (nodeIds: NodeID[], parentId: NodeID, groupId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] groupNodes '${groupId}' (${nodeIds.length} nodes) → parent '${parentId}'`);
  console.time("groupNodes");
  
  const parent = findNodeById(graph, parentId);
  if (!parent || !parent.children) {
    notFound("node", parentId);
    throw new Error(`Parent node '${parentId}' not found`);
  }
  
  const groupNode: ElkGraphNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [],
    edges: []
  };
  
  // Track which nodes are actually moved to update their edges later
  const movedNodeIds: NodeID[] = [];
  
  // Find and move the specified nodes into the new group
  for (const nodeId of nodeIds) {
    // Find the node and its actual parent (which may not be the specified parent)
    const node = findNodeById(graph, nodeId);
    if (!node) {
      notFound("node", nodeId);
      continue;
    }
    
    const actualParent = findParentOfNode(graph, nodeId);
    if (!actualParent || !actualParent.children) {
      console.warn(`Parent of node ${nodeId} not found`);
      continue;
    }
    
    // Remove the node from its actual parent
    actualParent.children = actualParent.children.filter(child => child.id !== nodeId);
    
    // Add the node to the group
    if (!groupNode.children) groupNode.children = [];
    groupNode.children.push(node);
    movedNodeIds.push(nodeId);
  }
  
  // Only add the group if it has children
  if (groupNode.children && groupNode.children.length > 0) {
    parent.children.push(groupNode);
    
    // Update edges for all moved nodes - this is the key improvement
    for (const nodeId of movedNodeIds) {
      graph = updateEdgesForNode(nodeId, graph);
    }
  } else {
    console.warn(`No nodes were moved to group ${groupId}`);
  }
  
  
  console.timeEnd("groupNodes");
  console.groupEnd();
  return graph;
};

/**
 * Removes a group node, moving its children to the parent and
 * properly handling edge reattachment.
 */
export const removeGroup = (groupId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] removeGroup '${groupId}'`);
  console.time("removeGroup");
  
  const groupNode = findNodeById(graph, groupId);
  if (!groupNode) {
    notFound("node", groupId);
    throw new Error(`Group '${groupId}' not found`);
  }
  
  const parent = findParentOfNode(graph, groupId);
  if (!parent || !parent.children) {
    throw new Error(`The group node does not have a parent (might be the root)`);
  }
  
  // Track which nodes are being moved up to update their edges
  const movedNodeIds: NodeID[] = [];
  
  // Add all group children to the parent
  if (groupNode.children) {
    for (const child of groupNode.children) {
      parent.children.push(child);
      movedNodeIds.push(child.id);
    }
  }
  
  // Remove the group node from the parent
  parent.children = parent.children.filter(child => child.id !== groupId);
  
  // Update edges for all moved nodes - this is the key improvement
  for (const nodeId of movedNodeIds) {
    graph = updateEdgesForNode(nodeId, graph);
  }
  
  console.timeEnd("removeGroup");
  console.groupEnd();
  return graph;
};

/**
 * Batch update multiple operations at once
 */
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
  console.group(`[mutation] batchUpdate (${operations.length} operations)`);
  console.time("batchUpdate");
  
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
  
  console.timeEnd("batchUpdate");
  console.groupEnd();
  return updatedGraph;
}; 