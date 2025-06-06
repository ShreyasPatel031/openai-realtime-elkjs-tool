// Define interfaces for ELK JS layout.
interface ElkLabel {
  text: string;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface ElkNode {
  id: string;
  labels: ElkLabel[];
  children?: ElkNode[];
  edges?: ElkEdge[];
}

// Used to hold edge arrays during traversal.
interface EdgeCollection {
  edgeArr: ElkEdge[];
  parent: ElkNode;
}

// ──────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Recursively finds a node by its id.
 */
function findNodeById(node: ElkNode, id: string): ElkNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively finds the parent of a node by its id.
 */
function findParentOfNode(
  root: ElkNode,
  id: string,
  parent: ElkNode | null = null
): ElkNode | null {
  if (root.id === id) return parent;
  if (root.children) {
    for (const child of root.children) {
      const result = findParentOfNode(child, id, root);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Get the path from the root to a target node.
 */
function getPathToNode(
  node: ElkNode,
  nodeId: string,
  path: ElkNode[] = []
): ElkNode[] | null {
  if (node.id === nodeId) return [...path, node];
  if (node.children) {
    for (const child of node.children) {
      const result = getPathToNode(child, nodeId, [...path, node]);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Find the common ancestor of two nodes.
 */
export function findCommonAncestor(
  layout: ElkNode,
  id1: string,
  id2: string
): ElkNode | null {
  const path1 = getPathToNode(layout, id1);
  const path2 = getPathToNode(layout, id2);
  if (!path1 || !path2) return null;
  let common: ElkNode | null = null;
  for (let i = 0; i < Math.min(path1.length, path2.length); i++) {
    if (path1[i].id === path2[i].id) {
      common = path1[i];
    } else {
      break;
    }
  }
  return common;
}

/**
 * Recursively traverses the layout and collects all edge arrays with their parent node.
 */
function collectEdges(node: ElkNode, collection: EdgeCollection[] = []): EdgeCollection[] {
  if (node.edges) {
    collection.push({ edgeArr: node.edges, parent: node });
  }
  if (node.children) {
    for (const child of node.children) {
      collectEdges(child, collection);
    }
  }
  return collection;
}

/**
 * Reattaches edges involving a moved node so that each edge is placed
 * under the common ancestor of its endpoints.
 */
function updateEdgesForNode(nodeId: string, layout: ElkNode): ElkNode {
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
}

/**
 * Validates graph structure to prevent circular references
 */
function validateGraphStructure(layout: ElkNode): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function hasCircularReference(node: ElkNode): boolean {
    if (recursionStack.has(node.id)) {
      console.error(`❌ Circular reference detected: ${node.id}`);
      return true;
    }
    
    if (visited.has(node.id)) {
      return false;
    }
    
    visited.add(node.id);
    recursionStack.add(node.id);
    
    if (node.children) {
      for (const child of node.children) {
        if (hasCircularReference(child)) {
          return true;
        }
      }
    }
    
    recursionStack.delete(node.id);
    return false;
  }
  
  return !hasCircularReference(layout);
}

// ──────────────────────────────────────────────
// PRIMITIVE OPERATIONS
// ──────────────────────────────────────────────

//
// 🟩 NODE OPERATIONS
//

/**
 * addNode(nodename, parentId)
 * Creates a new node and adds it under the given parent.
 */
export function addNode(
  nodename: string, 
  parentId: string, 
  layout: ElkNode, 
  data?: { label?: string; icon?: string; style?: any }
): ElkNode {
  const parent = findNodeById(layout, parentId);
  if (!parent) {
    console.error(`Parent node not found: ${parentId}`);
    return layout;
  }
  
  // Create new node: using data.label if provided, otherwise nodename
  const label = data?.label || nodename;
  const newNode: ElkNode = {
    id: nodename,
    labels: [{ text: label }],
    children: [],
    edges: []
  };
  
  // Add data properties if provided (for future compatibility)
  if (data) {
    (newNode as any).data = data;
  }
  
  if (!parent.children) parent.children = [];
  parent.children.push(newNode);
  return layout;
}

/**
 * deleteNode(nodeId)
 * Deletes a node from the layout and removes related edge references.
 */
export function deleteNode(nodeId: string, layout: ElkNode): ElkNode {
  // First, find and remove the node from its parent
  const parent = findParentOfNode(layout, nodeId);
  if (!parent || !parent.children) {
    console.error(`Node not found or trying to remove root: ${nodeId}`);
    return layout;
  }
  parent.children = parent.children.filter(child => child.id !== nodeId);

  // Function to remove edges related to the deleted node
  function removeEdges(node: ElkNode): void {
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
  removeEdges(layout);

  return layout;
}

/**
 * moveNode(nodeId, newParentId)
 * Moves a node from one parent to another and updates its edge attachments.
 */
export function moveNode(
  nodeId: string,
  newParentId: string,
  layout: ElkNode
): ElkNode {
  const node = findNodeById(layout, nodeId);
  const newParent = findNodeById(layout, newParentId);
  if (!node) {
    console.warn(`Node not found: ${nodeId}`);
    return layout;
  }
  if (!newParent) {
    console.warn(`New parent not found: ${newParentId}`);
    return layout;
  }
  const oldParent = findParentOfNode(layout, nodeId);
  if (!oldParent || !oldParent.children) {
    console.warn(`Node not found in any parent: ${nodeId}`);
    return layout;
  }
  // Remove the node from its old parent
  oldParent.children = oldParent.children.filter(child => child.id !== nodeId);
  // Add the node to the new parent
  if (!newParent.children) newParent.children = [];
  newParent.children.push(node);
  layout = updateEdgesForNode(nodeId, layout);
  return layout;
}

//
// 🟧 EDGE OPERATIONS
//

/**
 * addEdge(edgeId, sourceId, targetId)
 * Adds a new edge between two nodes.
 * The edge will be attached at the common ancestor.
 */
export function addEdge(
  edgeId: string,
  sourceId: string,
  targetId: string,
  layout: ElkNode
): ElkNode {
  const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
  if (!commonAncestor) {
    console.error(`Common ancestor not found for nodes: ${sourceId}, ${targetId}`);
    return layout;
  }
  const newEdge: ElkEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  if (!commonAncestor.edges) commonAncestor.edges = [];
  commonAncestor.edges.push(newEdge);
  return layout;
}

/**
 * deleteEdge(edgeId)
 * Deletes an edge from the layout.
 */
export function deleteEdge(edgeId: string, layout: ElkNode): ElkNode {
  function removeEdge(node: ElkNode): void {
    if (node.edges) {
      node.edges = node.edges.filter(edge => edge.id !== edgeId);
    }
    if (node.children) {
      for (const child of node.children) {
        removeEdge(child);
      }
    }
  }
  removeEdge(layout);
  return layout;
}


//
// 🟦 GROUP OPERATIONS
//

/**
 * groupNodes(nodeIds, parentId, groupId)
 * Creates a new group node under the given parent,
 * moves the specified nodes into the group, and updates edge attachments.
 */
export function groupNodes(
  nodeIds: string[],
  parentId: string,
  groupId: string,
  layout: ElkNode,
  style?: any,
  groupIconName?: string
): ElkNode {
  const parent = findNodeById(layout, parentId);
  if (!parent || !parent.children) {
    console.warn(`Parent not found: ${parentId}`);
    return layout;
  }
  
  const groupNode: ElkNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [],
    edges: []
  };
  
  // Always add group icon data - use provided groupIconName or fallback to neutral
  const finalGroupIconName = groupIconName || 'gcp_system'; // Default to neutral gray
  
  (groupNode as any).data = {
    label: groupId,
    groupIcon: finalGroupIconName,
    // Only include legacy style if no group icon provided (backward compatibility)
    ...(style && !groupIconName && { style })
  };
  
  // Find and move the specified nodes into the new group
  for (const nodeId of nodeIds) {
    // Find the node anywhere in the hierarchy
    const node = findNodeById(layout, nodeId);
    if (!node) {
      console.warn(`Node not found: ${nodeId}`);
      continue;
    }
    
    // Find the actual parent of this node
    const actualParent = findParentOfNode(layout, nodeId);
    if (!actualParent || !actualParent.children) {
      console.warn(`Parent of node ${nodeId} not found`);
      continue;
    }
    
    // Remove the node from its actual parent
    actualParent.children = actualParent.children.filter(child => child.id !== nodeId);
    
    // Add the node to the group
    if (!groupNode.children) groupNode.children = [];
    groupNode.children.push(node);
  }
  
  // Only add the group if it has children
  if (groupNode.children && groupNode.children.length > 0) {
  parent.children.push(groupNode);
  } else {
    console.warn(`No nodes were moved to group ${groupId}`);
    return layout;
  }
  
  // Update edges for moved nodes
  if (groupNode.children) {
    for (const child of groupNode.children) {
      layout = updateEdgesForNode(child.id, layout);
    }
  }
  
  return layout;
}

/**
 * removeGroup(groupId)
 * Removes a group node by moving its children up to the parent and updating edges.
 */
export function removeGroup(groupId: string, layout: ElkNode): ElkNode {
  const groupNode = findNodeById(layout, groupId);
  if (!groupNode) {
    console.warn(`Group not found: ${groupId}`);
    return layout;
  }
  const parent = findParentOfNode(layout, groupId);
  if (!parent || !parent.children) {
    console.warn(`The group node does not have a parent (maybe it is the root).`);
    return layout;
  }
  if (groupNode.children) {
    for (const child of groupNode.children) {
      parent.children.push(child);
      layout = updateEdgesForNode(child.id, layout);
    }
  }
  parent.children = parent.children.filter(child => child.id !== groupId);
  return layout;
}

/**
 * batchUpdate(operations)
 * Executes a series of graph operations in order.
 * Each operation can have parameters directly on the object or wrapped in args.
 */
export function batchUpdate(
  operations: Array<{name: string, args?: any, [key: string]: any}>,
  layout: ElkNode
): ElkNode {
  // Validate operations parameter
  if (!operations) {
    throw new Error(`batchUpdate requires 'operations' parameter, got: ${operations}`);
  }
  if (!Array.isArray(operations)) {
    throw new Error(`batchUpdate requires 'operations' to be an array, got: ${typeof operations} - ${JSON.stringify(operations)}`);
  }
  if (operations.length === 0) {
    console.warn(`batchUpdate called with empty operations array`);
    return layout;
  }
  
  // Validate initial graph structure
  if (!validateGraphStructure(layout)) {
    console.error('❌ Graph contains circular references - aborting batch update');
    throw new Error('Graph contains circular references which could cause infinite recursion');
  }
  
  let updatedLayout = { ...layout };
  
  for (const operation of operations) {
    const { name } = operation;
    
    // Support both formats: {name, args: {...}} and {name, param1, param2, ...}
    const params = operation.args || operation;
    
    console.log(`🔍 Processing helper batch operation '${name}' with params:`, params);
    
    switch (name) {
      case "add_node":
        if (!params.nodename || typeof params.nodename !== 'string') {
          throw new Error(`add_node requires 'nodename' as a string, got: ${JSON.stringify(params.nodename)}`);
        }
        if (!params.parentId || typeof params.parentId !== 'string') {
          throw new Error(`add_node requires 'parentId' as a string, got: ${JSON.stringify(params.parentId)}`);
        }
        updatedLayout = addNode(params.nodename, params.parentId, updatedLayout, params.data);
        break;
        
      case "delete_node":
        if (!params.nodeId || typeof params.nodeId !== 'string') {
          throw new Error(`delete_node requires 'nodeId' as a string, got: ${JSON.stringify(params.nodeId)}`);
        }
        updatedLayout = deleteNode(params.nodeId, updatedLayout);
        break;
        
      case "move_node":
        if (!params.nodeId || typeof params.nodeId !== 'string') {
          throw new Error(`move_node requires 'nodeId' as a string, got: ${JSON.stringify(params.nodeId)}`);
        }
        if (!params.newParentId || typeof params.newParentId !== 'string') {
          throw new Error(`move_node requires 'newParentId' as a string, got: ${JSON.stringify(params.newParentId)}`);
        }
        updatedLayout = moveNode(params.nodeId, params.newParentId, updatedLayout);
        break;
        
      case "add_edge":
        if (!params.edgeId || typeof params.edgeId !== 'string') {
          throw new Error(`add_edge requires 'edgeId' as a string, got: ${JSON.stringify(params.edgeId)}`);
        }
        if (!params.sourceId || typeof params.sourceId !== 'string') {
          throw new Error(`add_edge requires 'sourceId' as a string, got: ${JSON.stringify(params.sourceId)}`);
        }
        if (!params.targetId || typeof params.targetId !== 'string') {
          throw new Error(`add_edge requires 'targetId' as a string, got: ${JSON.stringify(params.targetId)}`);
        }
        updatedLayout = addEdge(params.edgeId, params.sourceId, params.targetId, updatedLayout);
        break;
        
      case "delete_edge":
        if (!params.edgeId || typeof params.edgeId !== 'string') {
          throw new Error(`delete_edge requires 'edgeId' as a string, got: ${JSON.stringify(params.edgeId)}`);
        }
        updatedLayout = deleteEdge(params.edgeId, updatedLayout);
        break;
        
      case "group_nodes":
        if (!params.nodeIds || !Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
          throw new Error(`group_nodes requires 'nodeIds' as a non-empty array, got: ${JSON.stringify(params.nodeIds)}`);
        }
        if (!params.parentId || typeof params.parentId !== 'string') {
          throw new Error(`group_nodes requires 'parentId' as a string, got: ${JSON.stringify(params.parentId)}`);
        }
        if (!params.groupId || typeof params.groupId !== 'string') {
          throw new Error(`group_nodes requires 'groupId' as a string, got: ${JSON.stringify(params.groupId)}`);
        }
        if (!params.groupIconName || typeof params.groupIconName !== 'string') {
          throw new Error(`group_nodes requires 'groupIconName' as a string for proper cloud provider styling, got: ${JSON.stringify(params.groupIconName)}`);
        }
        updatedLayout = groupNodes(params.nodeIds, params.parentId, params.groupId, updatedLayout, undefined, params.groupIconName);
        break;
        
      case "remove_group":
        if (!params.groupId || typeof params.groupId !== 'string') {
          throw new Error(`remove_group requires 'groupId' as a string, got: ${JSON.stringify(params.groupId)}`);
        }
        updatedLayout = removeGroup(params.groupId, updatedLayout);
        break;
        
      default:
        console.warn(`Unknown operation: ${name}`);
    }
    
    // Validate graph structure after each operation
    if (!validateGraphStructure(updatedLayout)) {
      console.error(`❌ Operation '${name}' created circular references - rolling back`);
      throw new Error(`Operation '${name}' created circular references in the graph structure`);
    }
  }
  
  return updatedLayout;
}
