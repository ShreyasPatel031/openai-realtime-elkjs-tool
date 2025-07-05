import { handleFunctionCall } from "../realtime/handleFunctionCall";
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "../utils/graph_helper_functions";

export interface FunctionExecutorCallbacks {
  addLine: (line: string) => void;
}

export interface GraphState {
  elkGraph: any;
  setElkGraph: (graph: any) => void;
}

export const executeFunctionCall = async (
  functionCall: any, 
  graphState: GraphState,
  callbacks: FunctionExecutorCallbacks,
  elkGraphRef: React.MutableRefObject<any>
) => {
  const { addLine } = callbacks;
  const { setElkGraph } = graphState;

  if (!setElkGraph) {
    addLine("❌ No graph state setter available");
    return "Error: No graph state setter available";
  }

  addLine(`🔧 Executing function: ${functionCall.name}`);
  
  // Log graph state before operation (using current ref value)
  console.log("📊 Graph state BEFORE operation:", elkGraphRef.current);
  
  let updatedGraph: any = null;
  
  try {
    // Special handling for display_elk_graph
    if (functionCall.name === 'display_elk_graph') {
      addLine(`📊 Displaying current graph state`);
      console.log("🔍 Current ELK Graph:", elkGraphRef.current);
      
      return {
        success: true,
        graph: elkGraphRef.current,
        message: `Current graph state displayed. ${elkGraphRef.current.children?.length || 0} groups found.`,
        instruction: "Now build the architecture by creating groups and nodes using batch_update. Start with the frontend group."
      };
    }
    
    // Use the existing handleFunctionCall function with current graph state
    handleFunctionCall(
      {
        name: functionCall.name,
        arguments: functionCall.arguments,
        call_id: functionCall.call_id
      },
      {
        elkGraph: elkGraphRef.current,
        setElkGraph: (newGraph: any) => {
          // Capture the updated graph
          updatedGraph = newGraph;
          // Log graph state after operation
          console.log("📊 Graph state AFTER operation:", newGraph);
          console.log("🔄 Graph layout changes detected - updating state");
          setElkGraph(newGraph);
          // Update the ref immediately
          elkGraphRef.current = newGraph;
          // Store graph globally for architecture completion notification
          (window as any).currentElkGraph = newGraph;
        },
        mutations: {
          addNode,
          deleteNode,
          moveNode,
          addEdge,
          deleteEdge,
          groupNodes,
          removeGroup,
          batchUpdate
        },
        safeSend: (event: any) => {
          // Send the event back to the real-time agent
          console.log("📤 Sending function result to real-time agent:", event);
          
          // Send the event to the real-time agent using the global function
          if (window.realtimeAgentSendTextMessage && typeof window.realtimeAgentSendTextMessage === 'function') {
            if (event.type === "conversation.item.create" && event.item?.type === "function_call_output") {
              try {
                const output = JSON.parse(event.item.output);
                if (output.graph) {
                  const summary = `Function ${output.operation} completed. Graph now has ${output.graph.nodeCount} nodes and ${output.graph.edgeCount} edges. Nodes: ${output.graph.nodes.map(n => n.id).join(', ')}. Edges: ${output.graph.edges.map(e => `${e.source}→${e.target}`).join(', ')}.`;
                  window.realtimeAgentSendTextMessage(summary);
                  console.log("📡 Sent graph update to real-time agent");
                }
              } catch (e) {
                console.error("Failed to parse function output:", e);
              }
            }
          } else {
            console.warn("⚠️ Real-time agent message function not available");
          }
        }
      }
    );
    
    addLine(`✅ Function executed successfully: ${functionCall.name}`);
    addLine(`📊 Graph updated! Check the canvas for changes.`);
    addLine(`🔍 Graph state logged to console`);
    
    // Return the updated graph or current if no update occurred
    const resultGraph = updatedGraph || elkGraphRef.current;
    
    // Return a structured response with the graph and instruction
    return {
      success: true,
      graph: resultGraph,
      message: `Successfully executed ${functionCall.name}. The graph has been updated.`,
      instruction: "Continue building the architecture by calling the next required function. Do not provide any explanation or acknowledgment."
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLine(`❌ Function execution failed: ${errorMsg}`);
    console.error("❌ Function execution error:", error);
    return {
      success: false,
      error: errorMsg,
      graph: elkGraphRef.current,
      instruction: "Fix the error and retry the operation. Do not provide explanations."
    };
  }
}; 