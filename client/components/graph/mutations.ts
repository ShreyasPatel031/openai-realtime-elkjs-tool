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
const edgeIdExists = (g: ElkGraphNode, eid: EdgeID): boolean =>
  collectEdges(g).some(({ edgeArr }) => edgeArr.some(e => e.id === eid));

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
export const addEdge = (edgeId: EdgeID, containerId: NodeID | null, sourceId: NodeID, targetId: NodeID, graph: RawGraph, label?: string): RawGraph => {
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
  
  // Find the common ancestor for edge placement - KEY IMPROVEMENT
  const commonAncestor = findCommonAncestor(graph, sourceId, targetId);
  
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
    
    switch (name) {
      case "add_node":
        updatedGraph = addNode(args.nodename!, args.parentId!, updatedGraph, args.data);
        break;
        
      case "delete_node":
        updatedGraph = deleteNode(args.nodeId!, updatedGraph);
        break;
        
      case "move_node":
        updatedGraph = moveNode(args.nodeId!, args.newParentId!, updatedGraph);
        break;
        
      case "add_edge":
        updatedGraph = addEdge(args.edgeId!, null, args.sourceId!, args.targetId!, updatedGraph, args.label);
        break;
        
      case "delete_edge":
        updatedGraph = deleteEdge(args.edgeId!, updatedGraph);
        break;
        
      case "group_nodes":
        updatedGraph = groupNodes(args.nodeIds!, args.parentId!, args.groupId!, updatedGraph, args.style || args.data?.style);
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

/**
 * Process user requirements and return sample text
 */
export const process_user_requirements = () => {
  console.group(`[mutation] process_user_requirements`);
  console.time("process_user_requirements");
  
  // Return an array of step strings instead of one long string
  const result = [
    `display_elk_graph({ title: "start" })`,
    
    `/* ───────── 1. root groups (users + gcp) */
batch_update({
  operations: [
    { name:"add_node", nodename:"users", parentId:"root",
      data:{ label:"End-Users", icon:"browser_client", style:"GREEN" } },
    { name:"add_node", nodename:"gcp", parentId:"root",
      data:{ label:"Google Cloud Platform", icon:"gcp_logo", style:"BLUE" } }
  ]
})`,
    
    `/* ───────── 2. users */
batch_update({
  operations: [
    { name:"add_node", nodename:"web_user",   parentId:"users",
      data:{ label:"Web",    icon:"browser_client", style:"GREEN" } },
    { name:"add_node", nodename:"mobile_user",parentId:"users",
      data:{ label:"Mobile", icon:"mobile_app",     style:"GREEN" } }
  ]
})`,
    
    `/* ───────── 3-A. edge / CDN (nodes) */
batch_update({
  operations: [
    { name:"add_node", nodename:"edge", parentId:"gcp",
      data:{ label:"Edge & CDN", icon:"cloud_cdn", style:"YELLOW" } },
    { name:"add_node", nodename:"cloud_cdn", parentId:"edge",
      data:{ label:"Cloud CDN", icon:"cloud_cdn", style:"YELLOW" } },
    { name:"add_node", nodename:"lb_https", parentId:"edge",
      data:{ label:"HTTPS LB", icon:"load_balancer_generic", style:"YELLOW" } },
    { name:"add_node", nodename:"cloud_armor", parentId:"edge",
      data:{ label:"Cloud Armor", icon:"cloud_armor", style:"YELLOW" } }
  ]
})`,
    
    `/* ───────── 3-B. edge / CDN (edges) */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_cdn_lb", sourceId:"cloud_cdn", targetId:"lb_https",   label:"route"   },
    { name:"add_edge", edgeId:"e_waf_lb", sourceId:"cloud_armor", targetId:"lb_https", label:"protect" },
    { name:"add_edge", edgeId:"e_web_edge",   sourceId:"web_user",    targetId:"cloud_cdn", label:"HTTPS" },
    { name:"add_edge", edgeId:"e_mobile_edge",sourceId:"mobile_user", targetId:"cloud_cdn", label:"HTTPS" }
  ]
})`,
    
    `/* ───────── 4. API & auth */
batch_update({
  operations: [
    { name:"add_node", nodename:"api", parentId:"gcp",
      data:{ label:"API Gateway + Auth", icon:"api_gateway", style:"PURPLE" } },
    { name:"add_node", nodename:"idp", parentId:"api",
      data:{ label:"Identity Plat.", icon:"iam", style:"PURPLE" } },
    { name:"add_node", nodename:"api_gw", parentId:"api",
      data:{ label:"API Gateway", icon:"api_gateway", style:"PURPLE" } },
    { name:"add_edge", edgeId:"e_idp_gw", sourceId:"idp",     targetId:"api_gw", label:"JWT"   },
    { name:"add_edge", edgeId:"e_lb_api", sourceId:"lb_https", targetId:"api_gw", label:"HTTPS" }
  ]
})`,
    
    `/* ───────── 5-A. backend nodes */
batch_update({
  operations: [
    { name:"add_node", nodename:"backend", parentId:"gcp",
      data:{ label:"Backend Svcs", icon:"cloud_run", style:"GREY" } },
    { name:"add_node", nodename:"order_svc",  parentId:"backend",
      data:{ label:"Order",   icon:"cloud_run", style:"GREY" } },
    { name:"add_node", nodename:"risk_svc",   parentId:"backend",
      data:{ label:"Risk",    icon:"cloud_run", style:"GREY" } },
    { name:"add_node", nodename:"catalog_svc",parentId:"backend",
      data:{ label:"Catalog", icon:"cloud_run", style:"GREY" } }
  ]
})`,
    
    `/* ───────── 5-B. backend edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_order_risk", sourceId:"order_svc", targetId:"risk_svc",   label:"score" },
    { name:"add_edge", edgeId:"e_api_order",  sourceId:"api_gw",    targetId:"order_svc",  label:"REST"  },
    { name:"add_edge", edgeId:"e_api_catalog",sourceId:"api_gw",    targetId:"catalog_svc",label:"REST"  }
  ]
})`,
    
    `/* ───────── 6. cache */
batch_update({
  operations: [
    { name:"add_node", nodename:"cache", parentId:"gcp",
      data:{ label:"Redis Cache", icon:"cache_redis", style:"GREEN" } },
    { name:"add_node", nodename:"redis", parentId:"cache",
      data:{ label:"Memorystore", icon:"cache_redis", style:"GREEN" } },
    { name:"add_edge", edgeId:"e_order_cache", sourceId:"order_svc", targetId:"redis", label:"session" }
  ]
})`,
    
    `/* ───────── 7-A. data stores (nodes) */
batch_update({
  operations: [
    { name:"add_node", nodename:"data", parentId:"gcp",
      data:{ label:"Data Stores", icon:"spanner", style:"GREEN" } },
    { name:"add_node", nodename:"spanner", parentId:"data",
      data:{ label:"Spanner", icon:"spanner", style:"GREEN" } },
    { name:"add_node", nodename:"firestore", parentId:"data",
      data:{ label:"Firestore", icon:"firestore", style:"GREEN" } }
  ]
})`,
    
    `/* ───────── 7-B. data store edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_catalog_db", sourceId:"catalog_svc", targetId:"spanner",   label:"read"  },
    { name:"add_edge", edgeId:"e_order_db",   sourceId:"order_svc",   targetId:"spanner",   label:"write" },
    { name:"add_edge", edgeId:"e_risk_db",    sourceId:"risk_svc",    targetId:"spanner",   label:"read"  },
    { name:"add_edge", edgeId:"e_catalog_fs", sourceId:"catalog_svc", targetId:"firestore", label:"stock" }
  ]
})`,
    
    `/* ───────── 8. orchestration */
batch_update({
  operations: [
    { name:"add_node", nodename:"orchestration", parentId:"gcp",
      data:{ label:"Workflows", icon:"workflows", style:"PURPLE" } },
    { name:"add_node", nodename:"workflows", parentId:"orchestration",
      data:{ label:"Workflows", icon:"workflows", style:"PURPLE" } },
    { name:"add_node", nodename:"eventarc", parentId:"orchestration",
      data:{ label:"Eventarc", icon:"eventarc", style:"PURPLE" } },
    { name:"add_node", nodename:"cloud_tasks", parentId:"orchestration",
      data:{ label:"Cloud Tasks", icon:"cloud_tasks", style:"PURPLE" } },
    { name:"add_edge", edgeId:"e_order_flow", sourceId:"order_svc", targetId:"workflows", label:"invoke" },
    { name:"add_edge", edgeId:"e_flow_risk",  sourceId:"workflows", targetId:"risk_svc",  label:"branch" }
  ]
})`,
    
    `/* ───────── 9-A. messaging nodes */
batch_update({
  operations: [
    { name:"add_node", nodename:"messaging", parentId:"gcp",
      data:{ label:"Pub/Sub", icon:"pubsub", style:"YELLOW" } },
    { name:"add_node", nodename:"order_topic", parentId:"messaging",
      data:{ label:"order-topic", icon:"pubsub", style:"YELLOW" } },
    { name:"add_node", nodename:"dlq_topic", parentId:"messaging",
      data:{ label:"DLQ", icon:"message_queue", style:"YELLOW" } }
  ]
})`,
    
    `/* ───────── 9-B. messaging edges */
batch_update({
  operations: [
    { name:"add_edge", edgeId:"e_flow_topic", sourceId:"workflows", targetId:"order_topic", label:"publish" },
    { name:"add_edge", edgeId:"e_topic_dlq",  sourceId:"order_topic", targetId:"dlq_topic", label:"DLQ" }
  ]
})`,
    
    `/* ───────── 10. monitoring */
batch_update({
  operations: [
    { name:"add_node", nodename:"monitoring", parentId:"gcp",
      data:{ label:"Monitoring", icon:"cloud_monitoring", style:"GREY" } },
    { name:"add_node", nodename:"cloud_monitoring", parentId:"monitoring",
      data:{ label:"Monitoring", icon:"cloud_monitoring", style:"GREY" } },
    { name:"add_node", nodename:"cloud_logging", parentId:"monitoring",
      data:{ label:"Logging", icon:"cloud_logging", style:"GREY" } },
    { name:"add_node", nodename:"cloud_trace", parentId:"monitoring",
      data:{ label:"Trace", icon:"cloud_trace", style:"GREY" } },
    { name:"add_node", nodename:"profiler", parentId:"monitoring",
      data:{ label:"Profiler", icon:"stackdriver_profiler", style:"GREY" } }
  ]
})`,
    
    `/* ───────── 11. third party services */
batch_update({
  operations: [
    { name:"add_node", nodename:"external", parentId:"root",
      data:{ label:"External APIs", icon:"third_party_api", style:"GREY" } },
    { name:"add_node", nodename:"payment_gateway", parentId:"external",
      data:{ label:"Payment GW", icon:"payment_gateway", style:"GREY" } },
    { name:"add_node", nodename:"email_svc", parentId:"external",
      data:{ label:"Email", icon:"notification_service", style:"GREY" } },
    { name:"add_edge", edgeId:"e_payment", sourceId:"order_svc", targetId:"payment_gateway", label:"charge" },
    { name:"add_edge", edgeId:"e_email",   sourceId:"workflows", targetId:"email_svc",      label:"notify" }
  ]
})`,
    
    `display_elk_graph({ title: "done" })`
  ];
  
  console.timeEnd("process_user_requirements");
  console.groupEnd();
  return result;
}; 