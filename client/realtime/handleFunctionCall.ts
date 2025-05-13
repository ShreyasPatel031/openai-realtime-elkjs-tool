// client/realtime/handleFunctionCall.ts
import { FunctionCall, ClientEvent } from './types';

interface MutationHelpers {
  addNode: (nodeName: string, parentId: string, graph: any, data?: { label?: string; icon?: string }) => any;
  deleteNode: (nodeId: string, graph: any) => any;
  moveNode: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge: (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => any;
  deleteEdge: (edgeId: string, graph: any) => any;
  groupNodes: (nodeIds: string[], parentId: string, groupId: string, graph: any) => any;
  removeGroup: (groupId: string, graph: any) => any;
  batchUpdate: (operations: Array<{name: string, args: any}>, graph: any) => any;
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

  try {
    switch (name) {
      case "display_elk_graph":
        // Nothing to change, just return a fresh copy so React sees a new object
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
        updated = mutations.addEdge(args.edgeId, null, args.sourceId, args.targetId, graphCopy);
        console.log(`➡️ Added edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
        break;
        
      case "delete_edge":
        updated = mutations.deleteEdge(args.edgeId, graphCopy);
        console.log(`✂️ Deleted edge '${args.edgeId}'`);
        break;
        
      case "group_nodes":
        updated = mutations.groupNodes(args.nodeIds, args.parentId, args.groupId, graphCopy);
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