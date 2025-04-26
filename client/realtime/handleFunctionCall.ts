// client/realtime/handleFunctionCall.ts
export function handleFunctionCall(
  call: any,
  helpers: {
    elkGraph: any;
    setElkGraph: (g: any) => void;
    mutations: {
      addNode: any; deleteNode: any; moveNode: any;
      addEdge: any; deleteEdge: any; groupNodes: any; removeGroup: any;
    };
    safeSend: (e: object) => void;
  }
) {
  const { name, arguments: argStr, call_id } = call;
  const args = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
  const { elkGraph, setElkGraph, mutations, safeSend } = helpers;

  let updated = elkGraph;
  
  try {
    switch (name) {
      case "display_elk_graph":
        // Just return the current graph
        updated = { ...elkGraph };
        console.log(updated);
        console.log(`⚪ Returning current graph with updated`);
        break;
        
      case "add_node":
        updated = mutations.addNode(args.nodename, args.parentId, elkGraph);
        console.log(`🟢 Added node '${args.nodename}' to parent '${args.parentId}'`);
        break;
        
      case "delete_node":
        updated = mutations.deleteNode(args.nodeId, elkGraph);
        console.log(`🔴 Deleted node '${args.nodeId}'`);
        break;
        
      case "move_node":
        updated = mutations.moveNode(args.nodeId, args.newParentId, elkGraph);
        console.log(`🔄 Moved node '${args.nodeId}' to parent '${args.newParentId}'`);
        break;
        
      case "add_edge":
        updated = mutations.addEdge(args.edgeId, null, args.sourceId, args.targetId, elkGraph);
        console.log(`➡️ Added edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
        break;
        
      case "delete_edge":
        updated = mutations.deleteEdge(args.edgeId, elkGraph);
        console.log(`✂️ Deleted edge '${args.edgeId}'`);
        break;
        
      case "group_nodes":
        updated = mutations.groupNodes(args.nodeIds, args.parentId, args.groupId, elkGraph);
        console.log(`📦 Grouped nodes [${args.nodeIds.join(', ')}] into '${args.groupId}' under '${args.parentId}'`);
        break;
        
      case "remove_group":
        updated = mutations.removeGroup(args.groupId, elkGraph);
        console.log(`📭 Removed group '${args.groupId}'`);
        break;
        
      default:
        console.warn(`⚠️ Unknown function call: ${name}`);
        return;
    }

    // Update the graph state
    setElkGraph(updated);
    console.log(`🔄 Graph state updated after ${name}`);

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