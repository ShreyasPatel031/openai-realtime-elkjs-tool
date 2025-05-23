import React, { useState } from "react";
import { handleFunctionCall } from "../realtime/handleFunctionCall";
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "./graph/mutations";
import { process_user_requirements } from "./graph/userRequirements";

type Msg = { role: "system" | "user" | "assistant"; content: string };

interface ChatTesterProps {
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
}

export default function ChatTester({ elkGraph, setElkGraph }: ChatTesterProps) {
  const [log, setLog] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Function to execute tools using the existing handleFunctionCall
  const executeTool = (name: string, args: any, callId: string) => {
    console.log(`Executing tool: ${name} with args:`, args);
    
    if (!elkGraph || !setElkGraph) {
      return "Error: No graph state available";
    }

    try {
      // Use the existing handleFunctionCall function
      handleFunctionCall(
        {
          name,
          arguments: args,
          call_id: callId
        },
        {
          elkGraph,
          setElkGraph,
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
          safeSend: () => {} // No-op for ChatTester
        }
      );
      
      return `Tool '${name}' executed successfully`;
    } catch (error) {
      console.error('Tool execution error:', error);
      return `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  };

  const test = async () => {
    try {
      setIsLoading(true);
      
      const conv: Msg[] = [
        { 
          role: "system", 
          content: "You have access to a set of graph manipulation tools for creating and managing ELK graphs. You can display graphs, add/delete nodes and edges, move nodes, group nodes, and perform batch operations. Always respond helpfully about what you can do and what tools you have available." 
        },
        { 
          role: "user", 
          content: "Create a simple web application architecture. Start by adding a 'frontend' group to root with style GREEN, then add a 'web-app' node inside it with browser_client icon. Next add a 'backend' group to root with style BLUE, add an 'api-server' node inside it with api_rest icon. Finally, add an edge from web-app to api-server with label 'HTTP requests'. Use batch operations where possible to be efficient." 
        }
      ];
      setLog(conv);

      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conv })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const { output } = await res.json();
      console.log("Chat response:", output);
      
      // Handle function call
      const fnCall = output.find((o: any) => o.type === "function_call");
      if (fnCall) {
        console.log("Function call detected:", fnCall);
        
        // Parse arguments if they're a string
        const parsedArgs = typeof fnCall.function_call.arguments === 'string' 
          ? JSON.parse(fnCall.function_call.arguments)
          : fnCall.function_call.arguments;
          
        const toolResult = executeTool(fnCall.function_call.name, parsedArgs, fnCall.call_id);

        console.log("Tool result:", toolResult);

        // Send function result back
        const final = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              ...conv,
              { 
                role: "assistant", 
                content: null, 
                tool_calls: [{
                  id: fnCall.call_id,
                  type: "function",
                  function: fnCall.function_call
                }]
              },
              { 
                role: "tool", 
                tool_call_id: fnCall.call_id,
                content: toolResult 
              }
            ]
          })
        }).then(r => r.json());

        console.log("Final response:", final);
        setLog(l => [...l, { role: "assistant", content: final.output_text || "No response" }]);
      } else {
        // No function call, just add the response
        const assistantMsg = output.find((o: any) => o.type === "message");
        if (assistantMsg) {
          setLog(l => [...l, { role: "assistant", content: assistantMsg.content }]);
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setLog(l => [...l, { role: "assistant", content: `Error: ${error}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <button 
        onClick={test} 
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50"
      >
        {isLoading ? "Testing..." : "Test Tool Call"}
      </button>
      <pre className="bg-gray-100 p-4 rounded whitespace-pre-wrap">
        {log.map((m, i) => `${m.role}: ${m.content}`).join("\n")}
      </pre>
    </div>
  );
} 