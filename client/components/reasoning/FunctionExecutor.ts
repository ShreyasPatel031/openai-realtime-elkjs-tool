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
  
  try {
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
          // Log graph state after operation
          console.log("📊 Graph state AFTER operation:", newGraph);
          console.log("🔄 Graph layout changes detected - updating state");
          setElkGraph(newGraph);
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
    return {
      graph: elkGraphRef.current
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    addLine(`❌ Function execution failed: ${errorMsg}`);
    console.error("❌ Function execution error:", error);
    return `Error: ${errorMsg}`;
  }
}; 