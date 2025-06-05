// client/realtime/handleFunctionCall.ts
import { FunctionCall, ClientEvent } from './types';
import { addUserDecisionToChat, createFollowupQuestionsToChat } from '../utils/chatUtils';

interface Mutations {
  addNode: (nodeName: string, parentId: string, graph: any, data?: { label?: string; icon?: string; style?: any }) => any;
  deleteNode: (nodeId: string, graph: any) => any;
  moveNode: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge: (edgeId: string, sourceId: string, targetId: string, graph: any, label?: string) => any;
  deleteEdge: (edgeId: string, graph: any) => any;
  groupNodes: (nodeIds: string[], parentId: string, groupId: string, graph: any, style?: any) => any;
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

export function handleFunctionCall(
  call: FunctionCall,
  helpers: FunctionCallHelpers
) {
  const { name, arguments: argStr, call_id } = call;
  const args = typeof argStr === "string" ? JSON.parse(argStr) : argStr || {};
  const { elkGraph, setElkGraph, mutations, safeSend } = helpers;

  // Always start from a deep copy so we never mutate the prev-state object
  const graphCopy =
    typeof structuredClone === "function"
      ? structuredClone(elkGraph)
      : JSON.parse(JSON.stringify(elkGraph));

  let updated = graphCopy;   // Work on the copy
  let result = null;

  try {
    switch (name) {
      case "display_elk_graph":
        // Nothing to change, just return a fresh copy so React sees a new object
        break;
        
      case "log_requirements_and_generate_questions":
        console.group('📝❓ log_requirements_and_generate_questions Function Call');
        console.log('Arguments from agent:', args);
        console.log('Requirements:', args.requirements);
        console.log('Questions:', args.questions);
        console.log('Call ID:', call_id);
        
        // Validate both requirements and questions
        if (!args.requirements || !Array.isArray(args.requirements) || args.requirements.length === 0) {
          console.error('❌ Invalid or empty requirements array');
          result = { success: false, message: 'Error: requirements must be a non-empty array' };
        } else if (!args.questions || !Array.isArray(args.questions) || args.questions.length === 0) {
          console.error('❌ Invalid or empty questions array');
          result = { success: false, message: 'Error: questions must be a non-empty array' };
        } else {
          // Log each requirement
          console.log('📝 Logging requirements...');
          for (const requirement of args.requirements) {
            const reqResult = addUserDecisionToChat(requirement);
            console.log(`Logged requirement: ${requirement}`, reqResult);
          }
          
          // Generate follow-up questions
          console.log('❓ Generating follow-up questions...');
          result = createFollowupQuestionsToChat(args.questions);
        }
        
        console.log('Function result:', result);
        
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(result)
          }
        });
        console.log('Sent response for log_requirements_and_generate_questions');
        console.groupEnd();
        safeSend({ type: "response.create" });
        return; // Return early to prevent graph update
        
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
        
        updated = mutations.groupNodes(args.nodeIds, args.parentId, args.groupId, graphCopy, args.style);
        console.log(`📦 Grouped nodes [${args.nodeIds.join(', ')}] into '${args.groupId}' under '${args.parentId}'`);
        break;
        
      case "remove_group":
        updated = mutations.removeGroup(args.groupId, graphCopy);
        console.log(`📭 Removed group '${args.groupId}'`);
        break;
        
      case "batch_update":
        updated = mutations.batchUpdate(args.operations, graphCopy);
        console.log(`🔄 Batch updated graph with ${args.operations.length} operations`);
        break;
        
      default:
        console.warn(`⚠️ Unknown function call: ${name}`);
        return;
    }

    // Push a new reference into state – React & the layout hook will rerun
    setElkGraph(updated);
    console.log(`🔄 Graph state updated after ${name}`);
    console.log('Updated graph:', updated);

    // Send function result back to the agent
    safeSend({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call_id,
        output: JSON.stringify(updated)
      }
    });
    safeSend({ type: "response.create" });
  } catch (error: any) {
    console.error(`❌ Error in ${name} operation:`, error);
    
    // Send error response back to the agent
    safeSend({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call_id,
        output: JSON.stringify({ 
          error: error?.message || 'Unknown error',
          message: `Error in ${name} operation: ${error?.message || 'Unknown error'}. Current graph remains unchanged.`
        })
      }
    });
    console.error(`❌ Sent error response to agent for ${name}`);
  }
} 