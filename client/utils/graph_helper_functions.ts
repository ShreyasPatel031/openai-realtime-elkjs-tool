// Define interfaces for ELK JS layout.
interface ElkLabel {
  text: string;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  labels?: ElkLabel[];
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
  
  if (!path1 || !path2) {
    return null;
  }
  
  // Find the longest common prefix
  let commonAncestor = null;
  for (let i = 0; i < Math.min(path1.length, path2.length); i++) {
    if (path1[i].id === path2[i].id) {
      commonAncestor = path1[i];
    } else {
      break;
    }
  }
  
  return commonAncestor;
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
  const edgesToMove: { edge: ElkEdge; currentParent: ElkNode; newParent: ElkNode }[] = [];
  
  // First pass: identify edges that need to be moved
  for (const { edgeArr, parent } of allEdges) {
    for (const edge of edgeArr) {
      if (edge.sources.includes(nodeId) || edge.targets.includes(nodeId)) {
        const sourceId = edge.sources[0];
        const targetId = edge.targets[0];
        
        const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
        if (commonAncestor && parent.id !== commonAncestor.id) {
          edgesToMove.push({
            edge: edge,
            currentParent: parent,
            newParent: commonAncestor
          });
        }
      }
    }
  }
  
  // Second pass: actually move the edges
  for (const { edge, currentParent, newParent } of edgesToMove) {
    // Remove from current parent
    if (currentParent.edges) {
      currentParent.edges = currentParent.edges.filter(e => e.id !== edge.id);
    }
    
    // Add to new parent
    if (!newParent.edges) {
      newParent.edges = [];
    }
    newParent.edges.push(edge);
  }
  
  return layout;
}

/**
 * Reattaches ALL edges in the graph to their correct common ancestors.
 * This is more comprehensive than updateEdgesForNode as it checks every edge,
 * not just edges involving a specific node.
 */
function reattachAllEdges(layout: ElkNode): ElkNode {
  const allEdges = collectEdges(layout);
  const edgesToMove: { edge: ElkEdge; currentParent: ElkNode; newParent: ElkNode }[] = [];
  
  // First pass: identify ALL edges that need to be moved
  for (const { edgeArr, parent } of allEdges) {
    for (const edge of edgeArr) {
      const sourceId = edge.sources[0];
      const targetId = edge.targets[0];
      
      const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
      if (commonAncestor && parent.id !== commonAncestor.id) {
        edgesToMove.push({
          edge: edge,
          currentParent: parent,
          newParent: commonAncestor
        });
      }
    }
  }
  
  // Second pass: actually move the edges
  for (const { edge, currentParent, newParent } of edgesToMove) {
    // Remove from current parent
    if (currentParent.edges) {
      currentParent.edges = currentParent.edges.filter(e => e.id !== edge.id);
    }
    
    // Add to new parent
    if (!newParent.edges) {
      newParent.edges = [];
    }
    newParent.edges.push(edge);
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
    const error = `Parent node not found: ${parentId}`;
    console.error(`❌ [ADD-NODE] ${error}`);
    throw new Error(error);
  }
  
  // Check if node already exists ANYWHERE in the graph
  const existingNode = findNodeById(layout, nodename);
  if (existingNode) {
    const path = getPathToNode(layout, nodename);
    const error = `Node ${nodename} already exists at: ${path?.map(n => n.id).join(' → ') || 'unknown'}`;
    console.error(`❌ [ADD-NODE] ${error}`);
    throw new Error(error);
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
    const error = `Node not found or trying to remove root: ${nodeId}`;
    console.error(`❌ [DELETE-NODE] ${error}`);
    throw new Error(error);
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
    const error = `Node not found: ${nodeId}`;
    console.error(`❌ [MOVE-NODE] ${error}`);
    throw new Error(error);
  }
  if (!newParent) {
    const error = `New parent not found: ${newParentId}`;
    console.error(`❌ [MOVE-NODE] ${error}`);
    throw new Error(error);
  }
  const oldParent = findParentOfNode(layout, nodeId);
  if (!oldParent || !oldParent.children) {
    const error = `Node not found in any parent: ${nodeId}`;
    console.error(`❌ [MOVE-NODE] ${error}`);
    throw new Error(error);
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
  layout: ElkNode,
  label?: string
): ElkNode {
  // Validate that both endpoints exist before attempting LCA
  const sourceNode = findNodeById(layout, sourceId);
  const targetNode = findNodeById(layout, targetId);
  if (!sourceNode && !targetNode) {
    const error = `Nodes not found: ${sourceId}, ${targetId}`;
    console.error(`❌ [ADD-EDGE] ${error}`);
    throw new Error(error);
  }
  if (!sourceNode) {
    const error = `Node not found: ${sourceId}`;
    console.error(`❌ [ADD-EDGE] ${error}`);
    throw new Error(error);
  }
  if (!targetNode) {
    const error = `Node not found: ${targetId}`;
    console.error(`❌ [ADD-EDGE] ${error}`);
    throw new Error(error);
  }

  const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
  if (!commonAncestor) {
    const error = `Common ancestor not found for nodes: ${sourceId}, ${targetId}`;
    console.error(`❌ [ADD-EDGE] ${error}`);
    throw new Error(error);
  }
  
  const newEdge: ElkEdge = {
    id: edgeId,
    sources: [sourceId],
    targets: [targetId]
  };
  
  // Add label if provided
  if (label) {
    newEdge.labels = [{ text: label }];
  }
  
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
  if (!parent) {
    console.error(`❌ [GROUP-NODES] Parent node not found: ${parentId}`);
    return layout;
  }
  
  // Check if group already exists ANYWHERE in the graph
  const existingGroup = findNodeById(layout, groupId);
  if (existingGroup) {
    const path = getPathToNode(layout, groupId);
    const error = `Group ${groupId} already exists at: ${path?.map(n => n.id).join(' → ') || 'unknown'}`;
    console.error(`❌ [GROUP-NODES] ${error}`);
    throw new Error(error);
  }
  
  // Create the group node
  const groupNode: ElkNode = {
    id: groupId,
    labels: [{ text: groupId }],
    children: [],
    edges: []
  };
  
  // Add style if provided
  if (style) {
    (groupNode as any).style = style;
  }
  
  // Add groupIconName if provided
  if (groupIconName) {
    (groupNode as any).groupIconName = groupIconName;
  }
  
  // Move nodes to the group
  const movedNodes: ElkNode[] = [];
  const failedNodes: string[] = [];
  
  if (parent.children) {
    for (const nodeId of nodeIds) {
      const nodeIndex = parent.children.findIndex(child => child.id === nodeId);
      if (nodeIndex >= 0) {
        const [node] = parent.children.splice(nodeIndex, 1);
        movedNodes.push(node);
      } else {
        console.warn(`⚠️ [GROUP-NODES] Node ${nodeId} not found in parent ${parentId}`);
        failedNodes.push(nodeId);
      }
    }
  }
  
  // If some nodes failed to move, provide detailed feedback
  if (failedNodes.length > 0) {
    const availableNodes = parent.children?.map(c => c.id).join(', ') || 'none';
    const error = `FAILED to move ${failedNodes.length} nodes: ${failedNodes.join(', ')}. Available nodes in parent ${parentId}: ${availableNodes}`;
    console.error(`❌ [GROUP-NODES] ${error}`);
    
    // If no nodes were moved, this is a complete failure
    if (movedNodes.length === 0) {
      throw new Error(`No nodes could be moved to group ${groupId}. ${error}`);
    } else {
      // Partial failure - still throw error but mention what succeeded
      throw new Error(`Partial failure: ${error}. Successfully moved: ${movedNodes.map(n => n.id).join(', ')}`);
    }
  }
  
  // Add moved nodes to the group
  groupNode.children = movedNodes;
  
  // Add the group to the parent
  if (!parent.children) parent.children = [];
  parent.children.push(groupNode);
  
  // Log edge distribution before reattachment
  const edgesBefore = collectEdges(layout);
  for (const { parent: container, edgeArr } of edgesBefore) {
    if (edgeArr.length > 0) {
      console.log(`  - ${container.id}: ${edgeArr.length} edges`);
    }
  }
  
  // Perform comprehensive edge reattachment for ALL edges
  layout = reattachAllEdges(layout);
  
  // Log edge distribution after reattachment
  const edgesAfter = collectEdges(layout);
  for (const { parent: container, edgeArr } of edgesAfter) {
    if (edgeArr.length > 0) {
      console.log(`  - ${container.id}: ${edgeArr.length} edges`);
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
    const error = `Group not found: ${groupId}`;
    console.error(`❌ [REMOVE-GROUP] ${error}`);
    throw new Error(error);
  }
  const parent = findParentOfNode(layout, groupId);
  if (!parent || !parent.children) {
    const error = `The group node does not have a parent (maybe it is the root): ${groupId}`;
    console.error(`❌ [REMOVE-GROUP] ${error}`);
    throw new Error(error);
  }
  
  if (groupNode.children) {
    for (const child of groupNode.children) {
      parent.children.push(child);
    }
  }
  
  // Remove the group node
  parent.children = parent.children.filter(child => child.id !== groupId);
  
  // Perform comprehensive edge reattachment since ungrouping can affect edge placement
  layout = reattachAllEdges(layout);
  
  return layout;
}

/**
 * batchUpdate(operations)
 * Executes a series of graph operations in order.
 * Each operation can have parameters directly on the object or wrapped in args.
 */
export function batchUpdate(
  operations: Array<{name: string, [key: string]: any}>,
  layout: ElkNode
): ElkNode {
  const results = [];
  const errors = [];
  
  console.log(`🔄 Processing batch update with ${operations.length} operations`);
  
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    
    try {
      switch (operation.name) {
        case 'add_node':
          addNode(
            operation.nodename,
            operation.parentId,
            layout,
            operation.data
          );
          break;
          
        case 'delete_node':
          deleteNode(operation.nodeId, layout);
          break;
          
        case 'move_node':
          moveNode(operation.nodeId, operation.newParentId, layout);
          break;
          
        case 'add_edge':
          addEdge(
            operation.edgeId,
            operation.sourceId,
            operation.targetId,
            layout,
            operation.label
          );
          break;
          
        case 'delete_edge':
          deleteEdge(operation.edgeId, layout);
          break;
          
        case 'group_nodes':
          groupNodes(
            operation.nodeIds,
            operation.parentId,
            operation.groupId,
            layout,
            operation.groupIconName
          );
          break;
          
        case 'remove_group':
          removeGroup(operation.groupId, layout);
          break;
          
        default:
          const error = `Unknown operation: ${(operation as any).name}`;
          console.error(`❌ [BATCH-UPDATE] ${error}`);
          errors.push(`Operation ${i + 1}/${operations.length}: ${error}`);
          continue;
      }
      
      // Operation succeeded
      results.push(`✅ Operation ${i + 1}/${operations.length} (${operation.name}) succeeded`);
      console.log(`✅ [BATCH-UPDATE] Operation ${i + 1}/${operations.length} (${operation.name}) succeeded`);
      
    } catch (error) {
      const errorMsg = `Operation ${i + 1}/${operations.length} (${operation.name}) failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ [BATCH-UPDATE] ${errorMsg}`);
      console.error(`  Operation details:`, operation);
      errors.push(errorMsg);
      
      // Continue with next operation instead of stopping
      continue;
    }
  }
  
  // Log summary
  console.log(`🔄 Batch update completed: ${results.length} succeeded, ${errors.length} failed`);
  
  if (errors.length > 0) {
    console.warn(`⚠️ Some operations failed:`, errors);
    // Don't throw error, just log the issues
  }
  
  return layout;
}

// ──────────────────────────────────────────────
// DIAGNOSTIC FUNCTIONS
// ──────────────────────────────────────────────

/**
 * Analyzes the current graph state to identify potential edge alignment issues
 */
export function analyzeGraphState(layout: ElkNode): void {
  const allEdges = collectEdges(layout);
  const edgeDistribution: { [containerId: string]: number } = {};
  const potentialMisalignments: string[] = [];
  
  // Count edges per container
  for (const { edgeArr, parent } of allEdges) {
    edgeDistribution[parent.id] = edgeArr.length;
    
    // Check each edge for potential misalignment
    for (const edge of edgeArr) {
      const sourceId = edge.sources[0];
      const targetId = edge.targets[0];
      const correctAncestor = findCommonAncestor(layout, sourceId, targetId);
      
      if (correctAncestor && parent.id !== correctAncestor.id) {
        potentialMisalignments.push(
          `Edge ${edge.id} (${sourceId} -> ${targetId}) is at ${parent.id} but should be at ${correctAncestor.id}`
        );
      }
    }
  }
  
  if (potentialMisalignments.length > 0) {
    console.log(`⚠️ [POTENTIAL-MISALIGNMENTS] Found ${potentialMisalignments.length} potential issues:`);
    potentialMisalignments.forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log(`✅ [EDGE-ALIGNMENT] All edges appear to be correctly aligned`);
  }
}

/**
 * Forces edge reattachment analysis for the entire graph
 */
export function forceEdgeReattachmentAnalysis(layout: ElkNode): ElkNode {
  const allEdges = collectEdges(layout);
  const edgesToMove: { edge: ElkEdge; currentParent: ElkNode; newParent: ElkNode }[] = [];
  
  // Check all edges in the graph
  for (const { edgeArr, parent } of allEdges) {
    for (const edge of edgeArr) {
      const sourceId = edge.sources[0];
      const targetId = edge.targets[0];
      
      const commonAncestor = findCommonAncestor(layout, sourceId, targetId);
      if (commonAncestor && parent.id !== commonAncestor.id) {
        edgesToMove.push({
          edge: edge,
          currentParent: parent,
          newParent: commonAncestor
        });
      }
    }
  }
  
  // Actually move the edges if any need moving
  for (const { edge, currentParent, newParent } of edgesToMove) {
    // Remove from current parent
    if (currentParent.edges) {
      currentParent.edges = currentParent.edges.filter(e => e.id !== edge.id);
    }
    
    // Add to new parent
    if (!newParent.edges) {
      newParent.edges = [];
    }
    newParent.edges.push(edge);
  }
  
  return layout;
}

/**
 * Shows detailed graph structure including node hierarchy and edge distribution
 */
export function showGraphStructure(layout: ElkNode): void {
  // Function to show hierarchy
  function showHierarchy(node: ElkNode, indent = 0) {
    const spacing = '  '.repeat(indent);
    const edgeCount = node.edges?.length || 0;
    const childCount = node.children?.length || 0;
    
    console.log(`${spacing}📁 ${node.id} (${childCount} children, ${edgeCount} edges)`);
    
    // Show edges at this level
    if (node.edges && node.edges.length > 0) {
      for (const edge of node.edges) {
        console.log(`${spacing}  🔗 ${edge.id}: ${edge.sources[0]} -> ${edge.targets[0]}`);
      }
    }
    
    // Show children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        showHierarchy(child, indent + 1);
      }
    }
  }
  
  showHierarchy(layout);
  
  // Show edge distribution summary
  const allEdges = collectEdges(layout);
  let totalEdges = 0;
  for (const { parent, edgeArr } of allEdges) {
    if (edgeArr.length > 0) {
      totalEdges += edgeArr.length;
      console.log(`  📍 ${parent.id}: ${edgeArr.length} edges`);
    }
  }
  console.log(`  🔢 Total edges: ${totalEdges}`);
}

/**
 * Validates batch operations to detect edge reattachment failures
 */
export function validateBatchOperations(operations: Array<{name: string, [key: string]: any}>): string[] {
  const warnings: string[] = [];
  
  // Count grouping operations that could affect edge placement
  const groupingOps = operations.filter(op => op.name === 'group_nodes').length;
  const edgeOps = operations.filter(op => op.name === 'add_edge').length;
  
  if (groupingOps > 0 && edgeOps > 0) {
    warnings.push(
      `ℹ️ EDGE REATTACHMENT REQUIRED: This operation sequence includes ${groupingOps} grouping operations ` +
      `and ${edgeOps} edge creation operations. Ensure edge reattachment is working properly during grouping.`
    );
  }
  
  return warnings;
}

/**
 * Validates graph state after operations to detect edge reattachment failures
 */
export function validateGraphState(layout: ElkNode): string[] {
  const issues: string[] = [];
  const allEdges = collectEdges(layout);
  
  // Count edges at root level
  const rootEdges = allEdges.find(({ parent }) => parent.id === 'root')?.edgeArr || [];
  const totalEdges = allEdges.reduce((sum, { edgeArr }) => sum + edgeArr.length, 0);
  
  // If more than 50% of edges are at root, likely reattachment failure
  if (rootEdges.length > totalEdges * 0.5 && totalEdges > 5) {
    issues.push(
      `🚨 SUSPECTED EDGE REATTACHMENT FAILURE: ${rootEdges.length}/${totalEdges} edges are at root level. ` +
      `This suggests automatic edge reattachment during grouping operations may have failed. ` +
      `Run forceEdgeReattachmentAnalysis() to fix.`
    );
  }
  
  // Check for specific misalignment patterns
  for (const { parent, edgeArr } of allEdges) {
    if (parent.id === 'root' && edgeArr.length > 0) {
      for (const edge of edgeArr) {
        const correctAncestor = findCommonAncestor(layout, edge.sources[0], edge.targets[0]);
        if (correctAncestor && correctAncestor.id !== 'root') {
          issues.push(
            `⚠️ MISALIGNED EDGE: Edge ${edge.id} (${edge.sources[0]} -> ${edge.targets[0]}) ` +
            `is at root but should be at ${correctAncestor.id}`
          );
        }
      }
    }
  }
  
  return issues;
}

/**
 * Comprehensive state synchronization diagnostic
 */
export function diagnoseStateSynchronization(): void {
  console.log(`🔍 [STATE-SYNC-DIAGNOSIS] Analyzing graph state synchronization issues`);
  
  // Check different potential graph state sources
  const sources = [
    { name: 'window.currentElkGraph', value: (window as any).currentElkGraph },
    { name: 'window.elkGraphForDiagnostics', value: (window as any).elkGraphForDiagnostics },
    { name: 'window.getCurrentGraph()', value: (window as any).getCurrentGraph?.() }
  ];
  
  console.log(`📊 [STATE-SYNC] Found ${sources.length} potential graph state sources:`);
  
  sources.forEach((source, index) => {
    if (source.value) {
      const nodeCount = source.value.children?.length || 0;
      const edgeCount = source.value.edges?.length || 0;
      const nodeIds = source.value.children?.map((n: any) => n.id) || [];
      
      console.log(`  ${index + 1}. ${source.name}:`);
      console.log(`     📍 Node count: ${nodeCount}`);
      console.log(`     🔗 Edge count: ${edgeCount}`);
      console.log(`     📝 Node IDs: [${nodeIds.join(', ')}]`);
      
      if (nodeCount > 0) {
        console.log(`     🏗️ Graph structure:`);
        showGraphStructure(source.value);
      }
    } else {
      console.log(`  ${index + 1}. ${source.name}: ❌ NOT AVAILABLE`);
    }
  });
  
  // Check for mismatches
  const availableSources = sources.filter(s => s.value);
  if (availableSources.length > 1) {
    console.log(`⚠️ [STATE-SYNC] MULTIPLE GRAPH STATES DETECTED - POTENTIAL RACE CONDITION!`);
    
    const referenceCounts = availableSources.map(s => ({
      name: s.name,
      nodes: s.value.children?.length || 0,
      edges: s.value.edges?.length || 0
    }));
    
    const nodeCountsMatch = referenceCounts.every(rc => rc.nodes === referenceCounts[0].nodes);
    const edgeCountsMatch = referenceCounts.every(rc => rc.edges === referenceCounts[0].edges);
    
    if (!nodeCountsMatch || !edgeCountsMatch) {
      console.error(`❌ [STATE-SYNC] STATE MISMATCH DETECTED:`);
      referenceCounts.forEach(rc => {
        console.error(`  - ${rc.name}: ${rc.nodes} nodes, ${rc.edges} edges`);
      });
    } else {
      console.log(`✅ [STATE-SYNC] All available sources have consistent counts`);
    }
  }
}

/**
 * Clean up duplicate groups in the graph
 */
export function cleanupDuplicateGroups(layout: ElkNode): ElkNode {
  const seenGroupIds = new Set<string>();
  const duplicatesToRemove: { parent: ElkNode, childIndex: number }[] = [];
  
  // Recursive function to find duplicates
  function findDuplicates(node: ElkNode, parent: ElkNode | null = null, childIndex: number = -1) {
    if (parent && childIndex >= 0) {
      if (seenGroupIds.has(node.id)) {
        console.warn(`🔍 [CLEANUP-DUPLICATES] Found duplicate: ${node.id} at ${parent.id}[${childIndex}]`);
        duplicatesToRemove.push({ parent, childIndex });
        return; // Don't process children of duplicates
      } else {
        seenGroupIds.add(node.id);
      }
    }
    
    if (node.children) {
      // Process children (iterate backwards since we might remove some)
      for (let i = node.children.length - 1; i >= 0; i--) {
        findDuplicates(node.children[i], node, i);
      }
    }
  }
  
  // Start the search
  findDuplicates(layout);
  
  // Remove duplicates
  for (const { parent, childIndex } of duplicatesToRemove) {
    if (parent.children && childIndex < parent.children.length) {
      const removed = parent.children.splice(childIndex, 1)[0];
    }
  }
  
  return layout;
}

