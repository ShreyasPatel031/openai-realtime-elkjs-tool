// client/realtime/handleFunctionCall.ts
import { FunctionCall, ClientEvent } from './types';
import { process_user_requirements } from '../components/graph/userRequirements';
import { addUserDecisionToChat, createFollowupQuestionsToChat } from '../utils/chatUtils';

interface MutationHelpers {
  addNode: (nodeName: string, parentId: string, graph: any, data?: { label?: string; icon?: string; style?: any }) => any;
  deleteNode: (nodeId: string, graph: any) => any;
  moveNode: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge: (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any, label?: string) => any;
  deleteEdge: (edgeId: string, graph: any) => any;
  groupNodes: (nodeIds: string[], parentId: string, groupId: string, graph: any, style?: any) => any;
  removeGroup: (groupId: string, graph: any) => any;
  batchUpdate: (operations: Array<{
    name: string;
    nodename?: string;
    parentId?: string;
    nodeId?: string;
    newParentId?: string;
    edgeId?: string;
    sourceId?: string;
    targetId?: string;
    nodeIds?: string[];
    groupId?: string;
    data?: { label?: string; icon?: string; style?: any };
    label?: string;
    style?: any;
  }>, graph: any) => any;
  process_user_requirements?: () => string;
}

interface FunctionCallHelpers {
  elkGraph: any;
  setElkGraph: (g: any) => void;
  mutations: MutationHelpers;
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
        
      case "add_user_decision":
        console.group('📝 add_user_decision Function Call');
        console.log('Arguments from agent:', args);
        console.log('Decision:', args.decision);
        console.log('Call ID:', call_id);
        
        result = addUserDecisionToChat(args.decision);
        console.log('Function result:', result);
        
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(result)
          }
        });
        console.log('Sent response for add_user_decision');
        console.groupEnd();
        safeSend({ type: "response.create" });
        return; // Return early to prevent graph update
        
      case "create_followup_questions":
        console.group('❓ create_followup_questions Function Call');
        console.log('Arguments from agent:', args);
        console.log('Raw argStr:', argStr);
        console.log('Questions:', args.questions);
        console.log('Args keys:', Object.keys(args));
        console.log('Args type:', typeof args);
        console.log('Is args an array?', Array.isArray(args));
        console.log('Call ID:', call_id);
        
        // Handle case where agent passes array directly instead of wrapping in questions property
        let questionsArray;
        if (Array.isArray(args)) {
          console.log('🔧 Agent passed array directly, using as questions');
          questionsArray = args;
        } else if (args.questions) {
          console.log('✅ Agent passed questions property correctly');
          questionsArray = args.questions;
        } else {
          console.error('❌ No questions found in arguments');
          questionsArray = null;
        }
        
        result = createFollowupQuestionsToChat(questionsArray);
        console.log('Function result:', result);
        
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(result)
          }
        });
        console.log('Sent response for create_followup_questions');
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
        updated = mutations.addEdge(args.edgeId, null, args.sourceId, args.targetId, graphCopy, args.label);
        console.log(`➡️ Added edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
        break;
        
      case "delete_edge":
        updated = mutations.deleteEdge(args.edgeId, graphCopy);
        console.log(`✂️ Deleted edge '${args.edgeId}'`);
        break;
        
      case "group_nodes":
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
        
      case "process_user_requirements":
        console.group('📋 process_user_requirements Function Call');
        console.log('Arguments from agent:', args);
        console.log('Raw argument string:', argStr);
        console.log('Call ID:', call_id);
        
        result = process_user_requirements(elkGraph, setElkGraph);
        console.log(`Function result: Array of ${Array.isArray(result) ? result.length : 0} strings`);
        
        // Format the array into a response object
        const responseObject = { 
          steps: result,
          stepCount: Array.isArray(result) ? result.length : 0,
          message: "Architecture building process initiated via StreamViewer (DOM trigger for UI output)."
        };
        const responseJson = JSON.stringify(responseObject);
        console.log(`Sending response as object with ${responseObject.stepCount} steps`);
        
        safeSend({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: responseJson
          }
        });
        console.log('Sent response as structured object with direct streaming execution');
        console.groupEnd();
        safeSend({ type: "response.create" });
        return; // Return early to prevent the graph update
        
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