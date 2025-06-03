import { handleFunctionCall } from "../../realtime/handleFunctionCall";
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "../graph/mutations";

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
          // Let handleFunctionCall do its job - we don't need to intercept
          // Just log what's being sent for debugging
          console.log("📤 safeSend called with:", event);
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