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
export function addNode(nodename: string, parentId: string, layout: ElkNode): ElkNode {
  const parent = findNodeById(layout, parentId);
  if (!parent) {
    console.error(`Parent node not found: ${parentId}`);
    return layout;
  }
  // Create new node: using nodename for both id and label.
  const newNode: ElkNode = {
    id: nodename,
    labels: [{ text: nodename }],
    children: [],
    edges: []
  };
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
  if (!node || !newParent) {
    console.error("Node or new parent not found");
    return layout;
  }
  const oldParent = findParentOfNode(layout, nodeId);
  if (!oldParent || !oldParent.children) {
    console.error(`Node not found in any parent: ${nodeId}`);
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
 * addEdge(edgeId, parentId, sourceId, targetId)
 * Adds a new edge between two nodes.
 * The edge will be attached at the common ancestor.
 */
export function addEdge(
  edgeId: string,
  parentId: string | null,  // kept for interface consistency, not used directly
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
  layout: ElkNode
): ElkNode {
  const parent = findNodeById(layout, parentId);
  if (!parent || !parent.children) {
    console.error(`Parent not found: ${parentId}`);
    return layout;
  }
  
  const groupNode: ElkNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [],
    edges: []
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
  
  // Add the group node to the parent
  parent.children.push(groupNode);
  
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
    console.error(`Group not found: ${groupId}`);
    return layout;
  }
  const parent = findParentOfNode(layout, groupId);
  if (!parent || !parent.children) {
    console.error("The group node does not have a parent (maybe it is the root).");
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

// ──────────────────────────────────────────────
// USAGE EXAMPLE
// ──────────────────────────────────────────────

// Assuming you have an initial layout like this:
let layout: ElkNode = {
  id: "root",
  labels: [{ text: "Root" }],
  children: [
    {
      id: "ui",
      labels: [{ text: "UI" }],
      children: [
        {
          id: "webapp",
          labels: [{ text: "Web App" }]
        }
      ]
    },
    // Other nodes go here…
  ],
  edges: []
};

// Example usage:
// Add a new node under "ui"
layout = addNode("newNode", "ui", layout);

// Move a node from "ui" to "aws"
layout = moveNode("webapp", "aws", layout);

// Add an edge connecting "newNode" to "webapp"
layout = addEdge("edge1", null, "newNode", "webapp", layout);

// Group two nodes under a new group called "group1" within "aws"
layout = groupNodes(["api", "lambda"], "aws", "group1", layout);

// Remove the group (ungroup)
layout = removeGroup("group1", layout);

// The modified layout can now be used with ELK JS.
console.log(JSON.stringify(layout, null, 2));
