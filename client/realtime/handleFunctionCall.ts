// client/realtime/handleFunctionCall.ts
import { FunctionCall, ClientEvent } from './types';
import { addUserDecisionToChat, createFollowupQuestionsToChat } from '../utils/chatUtils';

interface Mutations {
  addNode: (nodeName: string, parentId: string, graph: any, data?: { label?: string; icon?: string; style?: any }) => any;
  deleteNode: (nodeId: string, graph: any) => any;
  moveNode: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge: (edgeId: string, sourceId: string, targetId: string, graph: any, label?: string) => any;
  deleteEdge: (edgeId: string, graph: any) => any;
  groupNodes: (nodeIds: string[], parentId: string, groupId: string, graph: any, style?: any, groupIconName?: string) => any;
  removeGroup: (groupId: string, graph: any) => any;
  batchUpdate: (operations: any[], graph: any) => any;
  process_user_requirements?: () => string;
}

interface FunctionCallHelpers {
  elkGraph: any;
  setElkGraph: (g: any) => void;
  mutations: Mutations;
  safeSend: (e: ClientEvent) => void;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    realtimeAgentSendTextMessage?: (message: string) => void;
  }
}

export function handleFunctionCall(
  call: FunctionCall,
  helpers: FunctionCallHelpers
) {
  // Correct destructuring for call and helpers
  const { name, arguments: argStr, call_id } = call;
  const args = typeof argStr === "string" ? JSON.parse(argStr) : argStr || {};
  const { elkGraph, setElkGraph, mutations, safeSend } = helpers;

  // Essential logging only
  console.log(`🔧 ${name} (${call_id})`);

  let result: any = null;
  // Always start from a deep copy so we never mutate the prev-state object
  let graphCopy = typeof structuredClone === "function"
    ? structuredClone(elkGraph)
    : JSON.parse(JSON.stringify(elkGraph));
  let updated = graphCopy; // Work on the copy

  try {
    switch (name) {
      case "display_elk_graph":
        // Nothing to change, just return a fresh copy so React sees a new object
        // This will be handled by the common result generation below
        break;
        
      case "log_requirements_and_generate_questions":
        console.log('📝 Processing requirements and questions');
        try {
          // Validate both requirements and questions
          if (!args.requirements || !Array.isArray(args.requirements) || args.requirements.length === 0) {
            console.error('❌ Invalid or empty requirements array');
            result = { success: false, message: 'Error: requirements must be a non-empty array' };
          } else if (!args.questions || !Array.isArray(args.questions) || args.questions.length === 0) {
            console.error('❌ Invalid or empty questions array');
            result = { success: false, message: 'Error: questions must be a non-empty array' };
          } else {
            // Log each requirement to create UI components
            for (const requirement of args.requirements) {
              addUserDecisionToChat(requirement);
            }
            // Generate follow-up questions UI
            result = createFollowupQuestionsToChat(args.questions);
          }

          // Store requirements and questions in the graph metadata
          updated.metadata = updated.metadata || {};
          updated.metadata.requirements = args.requirements || [];
          updated.metadata.questions = args.questions || [];
        } catch (err) {
          // Catch any unexpected errors and send to agent
          console.error('❌ Exception in log_requirements_and_generate_questions:', err);
          result = { success: false, message: `Exception: ${err instanceof Error ? err.message : String(err)}` };
        }
        // Log the result before sending
        console.log('🔧 log_requirements_and_generate_questions result:', result);
        // Send response and return early to prevent graph update
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(result)
          }
        });
        return; // Return early to prevent graph update
        break;
        
      case "add_node":
        updated = mutations.addNode(args.nodename, args.parentId, graphCopy, args.data);
        console.log(`🟢 Added node '${args.nodename}' to parent '${args.parentId}'${args.data ? ' with data' : ''}`);
        break;
        
      case "delete_node":
        updated = mutations.deleteNode(args.nodeId, graphCopy);
        console.log(`🔴 Deleted node '${args.nodeId}'`);
        break;
        
      case "move_node":
        updated = mutations.moveNode(args.nodeId, args.newParentId, graphCopy);
        console.log(`🔄 Moved node '${args.nodeId}' to parent '${args.newParentId}'`);
        break;
        
      case "add_edge":
        updated = mutations.addEdge(args.edgeId, args.sourceId, args.targetId, graphCopy, args.label);
        console.log(`➡️ Added edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
        break;
        
      case "delete_edge":
        updated = mutations.deleteEdge(args.edgeId, graphCopy);
        console.log(`✂️ Deleted edge '${args.edgeId}'`);
        break;
        
      case "group_nodes":
        console.log('🔍 group_nodes arguments received:', args);
        
        // Validate required parameters before calling the function
        if (!args.nodeIds || !Array.isArray(args.nodeIds) || args.nodeIds.length === 0) {
          throw new Error(`group_nodes requires 'nodeIds' as a non-empty array, got: ${JSON.stringify(args.nodeIds)}`);
        }
        if (!args.parentId || typeof args.parentId !== 'string') {
          throw new Error(`group_nodes requires 'parentId' as a string, got: ${JSON.stringify(args.parentId)}`);
        }
        if (!args.groupId || typeof args.groupId !== 'string') {
          throw new Error(`group_nodes requires 'groupId' as a string, got: ${JSON.stringify(args.groupId)}`);
        }
        if (!args.groupIconName || typeof args.groupIconName !== 'string') {
          throw new Error(`group_nodes requires 'groupIconName' as a string for proper cloud provider styling, got: ${JSON.stringify(args.groupIconName)}`);
        }
        
        updated = mutations.groupNodes(args.nodeIds, args.parentId, args.groupId, graphCopy, undefined, args.groupIconName);
        console.log(`📦 Grouped nodes [${args.nodeIds.join(', ')}] into '${args.groupId}' under '${args.parentId}' with group icon: ${args.groupIconName}`);
        break;
        
      case "remove_group":
        updated = mutations.removeGroup(args.groupId, graphCopy);
        console.log(`📭 Removed group '${args.groupId}'`);
        break;
        
      case "batch_update":
        // Debug logging to see what's being passed
        console.log('🔍 batch_update received arguments:', JSON.stringify(args, null, 2));
        console.log('🔍 batch_update arg keys:', Object.keys(args));
        console.log('🔍 batch_update arg types:', Object.keys(args).map(k => `${k}: ${typeof args[k]}`));
        
        // Quick validation
        if (args.id || args.children || args.edges) {
          console.error('❌ batch_update received a graph object instead of operations array');
          console.error('❌ Received object with keys:', Object.keys(args));
          console.error('❌ Expected: { operations: [...] }');
          throw new Error(`batch_update requires an object with an 'operations' array. You passed a graph object instead. Please use: batch_update({ operations: [...] })`);
        }
        
        if (!args.operations) {
          console.error('❌ batch_update missing operations parameter');
          throw new Error(`batch_update requires an 'operations' array. Example: batch_update({ operations: [{ name: "add_node", ... }] })`);
        }
        
        if (!Array.isArray(args.operations)) {
          console.error('❌ batch_update operations is not an array:', typeof args.operations);
          throw new Error(`batch_update 'operations' must be an array. Got ${typeof args.operations}. Example: batch_update({ operations: [{ name: "add_node", ... }] })`);
        }
        
        // Validate operations
        args.operations.forEach((op, index) => {
          if (!op.name) {
            throw new Error(`Operation at index ${index} is missing required 'name' field`);
          }
          if (!['add_node', 'delete_node', 'move_node', 'add_edge', 'delete_edge', 'group_nodes', 'remove_group'].includes(op.name)) {
            throw new Error(`Operation at index ${index} has invalid name '${op.name}'. Must be one of: add_node, delete_node, move_node, add_edge, delete_edge, group_nodes, remove_group`);
          }
        });
        
        if (!updated || !updated.id) {
          console.error('❌ Invalid graph state detected');
          throw new Error(`Invalid graph state: graph must have an 'id' property`);
        }
        
        updated = mutations.batchUpdate(args.operations, graphCopy);
        console.log(`✅ batch_update: ${args.operations.length} operations completed`);
        break;
        
      default:
        console.warn(`⚠️ Unknown function call: ${name}`);
        result = { success: false, message: `Unknown function: ${name}` };
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(result)
          }
        });
        return;
    }

    // Helper function to recursively collect all nodes
    const collectAllNodes = (node: any, parentId: string = 'root'): any[] => {
      const nodes = [];
      if (node.children) {
        for (const child of node.children) {
          nodes.push({
            id: child.id,
            label: child.label || child.id,
            icon: child.icon,
            parentId: parentId,
            hasChildren: child.children && child.children.length > 0
          });
          // Recursively collect nested nodes
          nodes.push(...collectAllNodes(child, child.id));
        }
      }
      return nodes;
    };
    
    // Helper function to recursively collect all edges
    const collectAllEdges = (node: any): any[] => {
      const edges = [];
      if (node.edges) {
        for (const edge of node.edges) {
          edges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: edge.label || ''
          });
        }
      }
      if (node.children) {
        for (const child of node.children) {
          edges.push(...collectAllEdges(child));
        }
      }
      return edges;
    };
    
    // Create detailed result with graph information for the agent
    const allNodes = collectAllNodes(updated);
    const allEdges = collectAllEdges(updated);
    
    const graphSummary = {
      nodeCount: allNodes.length,
      edgeCount: allEdges.length,
      nodes: allNodes,
      edges: allEdges
    };
    
    // Create comprehensive result object - SUCCESS CASE
    result = {
      success: true,
      operation: name,
      message: `${name} completed successfully. Graph now has ${graphSummary.nodeCount} nodes and ${graphSummary.edgeCount} edges.`,
      graphInfo: {
        nodeCount: graphSummary.nodeCount,
        edgeCount: graphSummary.edgeCount,
        note: "This is informational only - do NOT pass this object to batch_update or other functions"
      },
      summary: {
        totalNodes: graphSummary.nodeCount,
        totalEdges: graphSummary.edgeCount,
        nodesList: graphSummary.nodes.map(n => `${n.id} (${n.icon || 'no-icon'})`).join(', '),
        edgesList: graphSummary.edges.map(e => `${e.source} → ${e.target}${e.label ? ` (${e.label})` : ''}`).join(', ')
      }
    };
    
    // Update graph state
    setElkGraph(updated);
    
    // Send the result back to the agent
    safeSend({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call_id,
        output: JSON.stringify(result)
      }
    });
  } catch (err) {
    // Log any unexpected errors in the main handler
    console.error('❌ Exception in handleFunctionCall:', err);
    
    // Create detailed error result for the agent
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Add specific guidance for different types of batch_update errors
    let specificGuidance = '';
    if (name === 'batch_update') {
      if (errorMessage.includes('graph object')) {
        specificGuidance = '\n\n🔥 CRITICAL: You MUST use the operations array format:\nbatch_update({ operations: [{ name: "add_node", nodename: "my-node", parentId: "root" }] })\n\nNEVER pass graph objects like { id: "...", children: [...] }!';
      } else if (errorMessage.includes('Common ancestor not found')) {
        specificGuidance = '\n\n🔥 EDGE ERROR: Cannot create edge between nodes that do not share a common parent container.\n\n' +
          '🔧 SOLUTION: Before adding an edge, ensure both source and target nodes exist and are in related containers.\n' +
          '✅ CORRECT APPROACH:\n' +
          '1. First add both nodes\n' +
          '2. Group related nodes into the same container if needed\n' +
          '3. Then add edges between nodes that share a common ancestor\n\n' +
          '❌ AVOID: Adding edges between nodes in completely separate, unrelated containers.';
      }
    }
    
    result = { 
      success: false, 
      operation: name,
      error: errorMessage,
      message: `❌ OPERATION FAILED: ${name} - ${errorMessage}${specificGuidance}`,
      details: `The operation '${name}' could not be completed. Please check the error message and retry with corrected parameters.`,
      retry_instructions: specificGuidance ? "Please follow the guidance above and retry the operation." : "Please correct the parameters and retry."
    };
    
    safeSend({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call_id,
        output: JSON.stringify(result)
      }
    });
    return;
  }
}