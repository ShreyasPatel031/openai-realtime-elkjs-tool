import React, { useState } from "react";
import { handleFunctionCall } from "../realtime/handleFunctionCall";
import { addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, batchUpdate } from "./graph/mutations";

interface StreamViewerProps {
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
}

export default function StreamViewer({ elkGraph, setElkGraph }: StreamViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [functionCall, setFunctionCall] = useState<any>(null);
  
  const addLine = (line: string) => setLines(ls => [...ls, line]);

  const appendToReasoningLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && newLines[lastLineIndex].startsWith('🧠 ')) {
        // Append to existing reasoning line
        newLines[lastLineIndex] += text;
      } else {
        // Start new reasoning line
        newLines.push(`🧠 ${text}`);
      }
      return newLines;
    });
  };

  const appendToArgsLine = (text: string) => {
    setLines(ls => {
      const newLines = [...ls];
      const lastLineIndex = newLines.length - 1;
      if (lastLineIndex >= 0 && newLines[lastLineIndex].startsWith('🔄 Building args: ')) {
        // Append to existing args line
        newLines[lastLineIndex] += text;
      } else {
        // Start new args line
        newLines.push(`🔄 Building args: ${text}`);
      }
      return newLines;
    });
  };

  const executeFunctionCall = async (functionCall: any) => {
    if (!elkGraph || !setElkGraph) {
      addLine("❌ No graph state available for function execution");
      return;
    }

    addLine(`🔧 Executing function: ${functionCall.name}`);
    
    try {
      // Use the existing handleFunctionCall function
      handleFunctionCall(
        {
          name: functionCall.name,
          arguments: functionCall.arguments,
          call_id: functionCall.call_id
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
          safeSend: () => {} // No-op for StreamViewer
        }
      );
      
      addLine(`✅ Function executed successfully: ${functionCall.name}`);
      addLine(`📊 Graph updated! Check the canvas for changes.`);
      
    } catch (error) {
      addLine(`❌ Function execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const start = () => {
    setBusy(true);
    setLines([]);
    setFunctionCall(null);
    
    const payload = JSON.stringify([
      { 
        role: "system", 
        content: `You are an expert system architect creating ELK graph diagrams. You have access to graph manipulation tools. 

IMPORTANT: Do NOT call display_elk_graph first. Start building immediately.

When creating architectures, think step-by-step about:
1. What components are needed and how to group them
2. What dependencies exist between components  
3. How to create them efficiently with batch operations
4. How to connect them with meaningful relationships

Think out loud about your architectural decisions and explain your reasoning as you work.` 
      },
      { 
        role: "user", 
        content: `I need you to create a comprehensive e-commerce microservices architecture from scratch. The graph is currently empty.

Requirements:
- Frontend layer: React web app and mobile app (group these together with GREEN style)
- API Gateway layer: Authentication, rate limiting, routing (BLUE style group)  
- Business services: Order service, Product catalog, User service, Payment service (PURPLE style group)
- Data layer: PostgreSQL for orders, MongoDB for products, Redis cache (YELLOW style group)
- Infrastructure: Load balancer, CDN, Message queue (GREY style group)

Please think through the architecture step by step, explaining your reasoning for each decision, then use batch_update operations to create the groups and services efficiently. After creating the nodes, add edges to show how services communicate.

Start building now - don't check the current graph state first.` 
      }
    ]);
    
    const ev = new EventSource(
      `/stream?payload=${encodeURIComponent(payload)}`
    );

    let currentFunctionCall: any = null;

    ev.onmessage = e => {
      const delta = JSON.parse(e.data);
      
      // Debug: Log all reasoning-related events
      if (delta.type.includes('reasoning')) {
        console.log('Reasoning event:', delta);
      }
      
      // Handle reasoning text accumulation
      if (delta.type === "response.reasoning_summary_text.delta") {
        appendToReasoningLine(delta.delta);
      } else if (delta.type === "response.reasoning_summary_part.added") {
        // This event is no longer used in the new reasoning handling
      } else if (delta.type === "response.reasoning_summary_text.done") {
        // This event is no longer used in the new reasoning handling
      } else if (delta.type === "response.output_item.added" && delta.item?.type === "reasoning") {
        addLine(`🧠 Reasoning started...`);
        console.log('Reasoning item added:', delta.item);
      } else if (delta.type === "response.output_item.done" && delta.item?.type === "reasoning") {
        console.log('Reasoning item done:', delta.item);
        if (delta.item.summary && delta.item.summary.length > 0) {
          addLine(`🧠 Final summary: ${delta.item.summary.join(' ')}`);
        }
      } else if (delta.type === "response.text.delta") {
        addLine(`💭 Text: ${delta.delta}`);
      } else if (delta.type === "response.function_call_arguments.delta") {
        appendToArgsLine(delta.delta);
      } else if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
        const funcCall = delta.item;
        addLine(`🎯 Function call: ${funcCall.name}`);
        addLine(`📝 Args: ${funcCall.arguments}`);
        
        // Store function call for execution
        currentFunctionCall = {
          name: funcCall.name,
          arguments: funcCall.arguments,
          call_id: funcCall.call_id
        };
        
      } else if (delta.type === "response.completed") {
        addLine(`✅ Stream completed`);
        const usage = delta.response?.usage;
        if (usage?.output_tokens_details?.reasoning_tokens) {
          addLine(`🧠 Reasoning tokens used: ${usage.output_tokens_details.reasoning_tokens}`);
        }
        if (usage?.total_tokens) {
          addLine(`📊 Total tokens: ${usage.total_tokens}`);
        }
        
        // Show reasoning summary from final response if available
        if (delta.response?.reasoning?.summary) {
          addLine(`🧠 Final reasoning summary: ${delta.response.reasoning.summary}`);
        }
        
        ev.close();
        setBusy(false);
        
        // Execute the function call if we have one
        if (currentFunctionCall) {
          setTimeout(() => executeFunctionCall(currentFunctionCall), 500);
        }
      } else {
        // Show other important events
        addLine(`📡 ${delta.type}`);
      }
    };
    
    ev.onerror = () => { 
      ev.close(); 
      setBusy(false); 
      addLine("❌ Stream ended or error occurred");
    };
    
    ev.onopen = () => {
      addLine("🚀 Stream started...");
    };
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={start} 
          disabled={busy || !elkGraph || !setElkGraph} 
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50"
        >
          {busy ? "Streaming..." : "Stream + Execute"}
        </button>
        <span className="text-sm text-gray-600">
          {busy ? "🔴 Streaming active" : !elkGraph ? "⚪ No graph state" : "⚪ Ready"}
        </span>
      </div>
      
      <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg h-96 overflow-auto text-sm border whitespace-pre-wrap break-words">
        {lines.join("\n")}
      </pre>
    </div>
  );
} 