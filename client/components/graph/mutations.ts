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
import { getStyle } from "./styles";

// ──────────────────────────────────────────────
// NEW HELPERS – tiny & fast, no external deps
// ──────────────────────────────────────────────

/** DFS yields *all* nodes inside a subtree (including the root). */
const collectNodeIds = (n: ElkGraphNode, acc: Set<NodeID> = new Set()) => {
  acc.add(n.id);
  (n.children ?? []).forEach(c => collectNodeIds(c, acc));
  return acc;
};

/** True if "maybeDesc" lives somewhere inside "root". */
const isDescendantOf = (root: ElkGraphNode, maybeDesc: ElkGraphNode): boolean =>
  collectNodeIds(root).has(maybeDesc.id);

/** True if any edge id matches. */
const edgeIdExists = (g: ElkGraphNode, eid: EdgeID): boolean => {
  const allEdges = collectEdges(g);
  console.log(`🔍 [edgeIdExists] Checking for edge: ${eid}`);
  console.log(`🔍 [edgeIdExists] Found ${allEdges.length} edge containers`);
  
  for (const { edgeArr, parent } of allEdges) {
    console.log(`🔍 [edgeIdExists] Container ${parent.id} has ${edgeArr.length} edges:`, edgeArr.map(e => e.id));
    const found = edgeArr.find(e => e.id === eid);
    if (found) {
      console.log(`❌ [edgeIdExists] FOUND DUPLICATE: ${eid} in container ${parent.id}`);
      return true;
    }
  }
  
  console.log(`✅ [edgeIdExists] Edge ${eid} does not exist`);
  return false;
};

/** Remove every edge whose *any* endpoint is found in `victimIds`. */
const purgeEdgesReferencing = (root: ElkGraphNode, victimIds: Set<NodeID>): void => {
  const sweep = (n: ElkGraphNode) => {
    if (n.edges) {
      n.edges = n.edges.filter(
        e =>
          !e.sources.some(s => victimIds.has(s)) &&
          !e.targets.some(t => victimIds.has(t))
      );
    }
    (n.children ?? []).forEach(sweep);
  };
  sweep(root);
};

const reattachEdgesForSubtree = (subRoot: ElkGraphNode, graph: ElkGraphNode) => {
  const queue: ElkGraphNode[] = [subRoot];
  while (queue.length) {
    const n = queue.shift()!;
    updateEdgesForNode(n.id, graph);
    n.children?.forEach(c => queue.push(c));
  }
};

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
  return layout;
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
export const addNode = (
  nodeName: string, 
  parentId: NodeID, 
  graph: RawGraph,
  data?: { label?: string; icon?: string; style?: any }
): RawGraph => {
  console.group(`[mutation] addNode '${nodeName}' → parent '${parentId}'`);
  console.time("addNode");

  // Check for duplicate ID using normalized name
  const normalizedId = createNodeID(nodeName);
  if (findNodeById(graph, normalizedId)) {
    throw new Error(`duplicate node id '${normalizedId}'`);
  }
  
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
    id: normalizedId,
    labels: [{ text: data?.label || nodeName }],
    children: []
  };
  
  // Add optional data properties
  if (data) {
    // Process style if it's a string reference
    if (data.style && typeof data.style === 'string') {
      data = {
        ...data,
        style: getStyle(data.style)
      };
    }
    
    newNode.data = {
      ...newNode.data,
      ...data
    };
  }
  
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

  // 1. locate
  const doomed = parent.children.find(c => c.id === nodeId)!;
  
  // 2. remove from parent
  parent.children = parent.children.filter(c => c !== doomed);
  
  // 3. purge every edge that pointed to it or descendants
  purgeEdgesReferencing(graph, collectNodeIds(doomed));
  
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
  
  // 1. forbid moving into own descendant (cycle)
  if (isDescendantOf(node, newParent)) {
    throw new Error(`Cannot move '${nodeId}' into its own descendant '${newParentId}'`);
  }

  // 2. forbid ID collision among siblings (already ensured but cheap to keep)
  if (newParent.children?.some(c => c.id === nodeId)) {
    throw new Error(`'${newParentId}' already contains a child with id '${nodeId}'`);
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
  // const updatedGraph = updateEdgesForNode(nodeId, graph);
  reattachEdgesForSubtree(node, graph);
  
  console.timeEnd("moveNode");
  console.groupEnd();
  return graph;
};

//
// 🟧 EDGE OPERATIONS
//

/**
 * Add an edge between nodes at the common ancestor level
 */
export const addEdge = (edgeId: EdgeID, sourceId: NodeID, targetId: NodeID, graph: RawGraph, label?: string): RawGraph => {
  console.group(`[mutation] addEdge '${edgeId}' (${sourceId} → ${targetId})${label ? ` with label "${label}"` : ''}`);
  console.time("addEdge");
  
  // duplicate-ID check
  if (edgeIdExists(graph, edgeId)) {
    throw new Error(`Edge id '${edgeId}' already exists`);
  }
  // self-loop guard
  if (sourceId === targetId) {
    throw new Error(`Self-loop edges are not supported (source === target '${sourceId}')`);
  }
  
  // Find the common ancestor for edge placement
  let commonAncestor = findCommonAncestor(graph, sourceId, targetId);
  
  // If no common ancestor found, or it's null, default to root
  if (!commonAncestor) {
    console.warn(`Common ancestor not found for nodes: ${sourceId}, ${targetId}. Attaching edge to root.`);
    // No common ancestor found, attach to root node instead
    const root = graph;
    
    // Create the edge
    const newEdge: ElkGraphEdge = {
      id: edgeId,
      sources: [sourceId],
      targets: [targetId]
    };
    
    // Add label if provided
    if (label) {
      newEdge.labels = [{ text: label }];
    }
    
    // Ensure the root has edges array
    if (!root.edges) {
      root.edges = [];
    }
    
    // Add the edge to the root
    root.edges.push(newEdge);
    
    console.timeEnd("addEdge");
    console.groupEnd();
    return graph;
  }
  
  // Create the edge
  const newEdge: ElkGraphEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Add label if provided
  if (label) {
    newEdge.labels = [{ text: label }];
  }
  
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
export const groupNodes = (nodeIds: NodeID[], parentId: NodeID, groupId: NodeID, graph: RawGraph, style?: any): RawGraph => {
  console.group(`[mutation] groupNodes '${groupId}' (${nodeIds.length} nodes) → parent '${parentId}'${style ? ' with style' : ''}`);
  console.time("groupNodes");
  
  // Check for duplicate ID using normalized group ID
  const normalizedGroupId = createNodeID(groupId);
  if (findNodeById(graph, normalizedGroupId)) {
    throw new Error(`duplicate group id '${normalizedGroupId}'`);
  }
  
  const parent = findNodeById(graph, parentId);
  if (!parent || !parent.children) {
    notFound("node", parentId);
    throw new Error(`Parent node '${parentId}' not found`);
  }

  // Prevent cycles: check if any node being grouped is a descendant of the parent or is the parent itself
  for (const id of nodeIds) {
    const cand = findNodeById(graph, id)!;
    if (isDescendantOf(cand, parent) || cand.id === parentId) {
      throw new Error("Cannot group a node into one of its descendants (cycle)");
    }
  }
  
  const groupNode: ElkGraphNode = {
    id: normalizedGroupId,
    labels: [{ text: groupId }],
    children: [],
    edges: []
  };
  
  // Add style data if provided
  if (style) {
    // Use the getStyle helper to resolve string style names to actual style objects
    const resolvedStyle = getStyle(style);
    groupNode.data = {
      ...groupNode.data,
      label: groupId,
      style: resolvedStyle
    };
  }
  
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
    
    // Update edges for all moved nodes and their descendants
    movedNodeIds
      .map(id => findNodeById(graph, id)!)
      .forEach(subRoot => reattachEdgesForSubtree(subRoot, graph));
  } else {
    console.warn(`No nodes were moved to group ${groupId}`);
  }
  
  
  console.timeEnd("groupNodes");
  console.groupEnd();
  return graph;
};

/**
 * Removes a group by hoisting each child with moveNode, then moves
 * the group's own edges to its parent.  No extra helpers needed.
 */
export const removeGroup = (groupId: NodeID, graph: RawGraph): RawGraph => {
  console.group(`[mutation] removeGroup '${groupId}'`);
  console.time("removeGroup");

  /* locate group & parent ------------------------------------------------ */
  const groupNode  = findNodeById(graph, groupId);
  if (!groupNode)          throw new Error(`Group '${groupId}' not found`);
  const parentNode = findParentOfNode(graph, groupId);
  if (!parentNode || !parentNode.children)
    throw new Error(`Group '${groupId}' has no parent (maybe root?)`);

  /* 1. hoist every child with the *existing* moveNode -------------------- */
  const childIds = (groupNode.children ?? []).map(c => c.id);
  for (const cid of childIds) moveNode(cid, parentNode.id, graph);

  /* 2. relocate the group's own edges straight into the parent ----------- */
  if (groupNode.edges?.length) {
    parentNode.edges = parentNode.edges ?? [];
    parentNode.edges.push(...groupNode.edges);
  }

  /* 3. finally remove the empty group container -------------------------- */
  parentNode.children = parentNode.children.filter(c => c.id !== groupId);

  /* 4. scrub edges that pointed *to* the deleted group itself ------------ */
  purgeEdgesReferencing(graph, new Set<NodeID>([groupId]));

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
  data?: { label?: string; icon?: string; style?: any };
  label?: string;
  style?: any;
}>, graph: RawGraph) => {
  console.group(`[mutation] batchUpdate (${operations.length} operations)`);
  console.time("batchUpdate");
  
  let updatedGraph = { ...graph };
  
  for (const operation of operations) {
    const { name, ...args } = operation;
    
    console.log(`🔍 Processing batch operation '${name}' with args:`, args);
    
    switch (name) {
      case "add_node":
        if (!args.nodename || typeof args.nodename !== 'string') {
          throw new Error(`add_node requires 'nodename' as a string, got: ${JSON.stringify(args.nodename)}`);
        }
        if (!args.parentId || typeof args.parentId !== 'string') {
          throw new Error(`add_node requires 'parentId' as a string, got: ${JSON.stringify(args.parentId)}`);
        }
        updatedGraph = addNode(args.nodename, args.parentId, updatedGraph, args.data);
        break;
        
      case "delete_node":
        if (!args.nodeId || typeof args.nodeId !== 'string') {
          throw new Error(`delete_node requires 'nodeId' as a string, got: ${JSON.stringify(args.nodeId)}`);
        }
        updatedGraph = deleteNode(args.nodeId, updatedGraph);
        break;
        
      case "move_node":
        if (!args.nodeId || typeof args.nodeId !== 'string') {
          throw new Error(`move_node requires 'nodeId' as a string, got: ${JSON.stringify(args.nodeId)}`);
        }
        if (!args.newParentId || typeof args.newParentId !== 'string') {
          throw new Error(`move_node requires 'newParentId' as a string, got: ${JSON.stringify(args.newParentId)}`);
        }
        updatedGraph = moveNode(args.nodeId, args.newParentId, updatedGraph);
        break;
        
      case "add_edge":
        if (!args.edgeId || typeof args.edgeId !== 'string') {
          throw new Error(`add_edge requires 'edgeId' as a string, got: ${JSON.stringify(args.edgeId)}`);
        }
        if (!args.sourceId || typeof args.sourceId !== 'string') {
          throw new Error(`add_edge requires 'sourceId' as a string, got: ${JSON.stringify(args.sourceId)}`);
        }
        if (!args.targetId || typeof args.targetId !== 'string') {
          throw new Error(`add_edge requires 'targetId' as a string, got: ${JSON.stringify(args.targetId)}`);
        }
        updatedGraph = addEdge(args.edgeId, args.sourceId, args.targetId, updatedGraph, args.label);
        break;
        
      case "delete_edge":
        if (!args.edgeId || typeof args.edgeId !== 'string') {
          throw new Error(`delete_edge requires 'edgeId' as a string, got: ${JSON.stringify(args.edgeId)}`);
        }
        updatedGraph = deleteEdge(args.edgeId, updatedGraph);
        break;
        
      case "group_nodes":
        if (!args.nodeIds || !Array.isArray(args.nodeIds) || args.nodeIds.length === 0) {
          throw new Error(`group_nodes requires 'nodeIds' as a non-empty array, got: ${JSON.stringify(args.nodeIds)}`);
        }
        if (!args.parentId || typeof args.parentId !== 'string') {
          throw new Error(`group_nodes requires 'parentId' as a string, got: ${JSON.stringify(args.parentId)}`);
        }
        if (!args.groupId || typeof args.groupId !== 'string') {
          throw new Error(`group_nodes requires 'groupId' as a string, got: ${JSON.stringify(args.groupId)}`);
        }
        updatedGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, updatedGraph, args.style || args.data?.style);
        break;
        
      case "remove_group":
        if (!args.groupId || typeof args.groupId !== 'string') {
          throw new Error(`remove_group requires 'groupId' as a string, got: ${JSON.stringify(args.groupId)}`);
        }
        updatedGraph = removeGroup(args.groupId, updatedGraph);
        break;
        
      default:
        console.warn(`Unknown operation: ${name}`);
    }
  }
  
  console.timeEnd("batchUpdate");
  console.groupEnd();
  return updatedGraph;
}; 