import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types/chat';
import { chunkTools } from '../utils/splitTools';
import { sendEventWithAutoChunk } from '../utils/eventSender';
import { sendFunctionResult } from '../utils/sendFunctionResult';

interface UseChatSessionProps {
  isSessionActive: boolean;
  sendTextMessage?: (message: string) => void;
  sendClientEvent?: (event: any) => void;
  events?: any[];
  elkGraph?: any;
  setElkGraph?: (graph: any) => void;
  elkGraphDescription?: string;
  agentInstruction?: string;
  // For use with mutations
  addNode?: (nodeName: string, parentId: string, graph: any) => any;
  deleteNode?: (nodeId: string, graph: any) => any;
  moveNode?: (nodeId: string, newParentId: string, graph: any) => any;
  addEdge?: (edgeId: string, containerId: string | null, sourceId: string, targetId: string, graph: any) => any;
  deleteEdge?: (edgeId: string, graph: any) => any;
  groupNodes?: (nodeIds: string[], parentId: string, groupId: string, graph: any) => any;
  removeGroup?: (groupId: string, graph: any) => any;
}

export const useChatSession = ({
  isSessionActive,
  sendTextMessage,
  sendClientEvent,
  events = [],
  elkGraph,
  setElkGraph,
  elkGraphDescription = '',
  agentInstruction = '',
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup
}: UseChatSessionProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [messageSendStatus, setMessageSendStatus] = useState<{
    sending: boolean;
    retrying: boolean;
    retryCount: number;
    lastError: Error | null;
  }>({
    sending: false,
    retrying: false,
    retryCount: 0,
    lastError: null
  });
  const initSentRef = useRef(false);
  const pendingMessagesRef = useRef<any[]>([]);
  const processedCalls = useRef<Set<string>>(new Set());


  // Safe wrapper for sending client events
  const safeSendClientEvent = useCallback((event: any) => {
    if (sendClientEvent) {
      setMessageSendStatus(prev => ({ ...prev, sending: true }));
      try {
        sendClientEvent(event);
        setMessageSendStatus(prev => ({ ...prev, sending: false, retryCount: 0, lastError: null }));
      } catch (error) {
        setMessageSendStatus(prev => ({ 
          ...prev, 
          sending: false, 
          retrying: true, 
          retryCount: prev.retryCount + 1,
          lastError: error as Error
        }));
      }
    }
  }, [sendClientEvent]);

  // Process events from the server
  const processEvents = useCallback(() => {
    if (!isSessionActive || !events || events.length === 0) return;

    // Handle text messages from the assistant
    const latestServerEvent = events
      .filter(event => 
        event.type === 'response.delta' && 
        event.delta?.type === 'message' && 
        event.delta?.content?.[0]?.type === 'text'
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (latestServerEvent) {
      // Extract text from the event
      const text = latestServerEvent.delta.content[0].text;
      
      // Check if we already have this response
      const existingMessage = messages.find(msg => 
        msg.sender === 'assistant' && 
        msg.id === latestServerEvent.event_id
      );
      
      if (existingMessage) {
        // Update existing message
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === latestServerEvent.event_id 
              ? { ...msg, content: text } 
              : msg
          )
        );
      } else {
        // Add new message
        setMessages(prevMessages => [
          ...prevMessages, 
          {
            id: latestServerEvent.event_id,
            content: text,
            sender: 'assistant'
          }
        ]);
      }
    }

    // Log function calls from the agent
    const functionCalls = events.flatMap(e => {
      /* stream chunks */
      if (e.type === "response.delta" && e.delta?.type === "function_call") {
        return [e.delta];                 // a single chunk
      }

      /* legacy / non-streaming */
      if (e.type === "response.done" && e.response?.output) {
        return e.response.output.filter((o: any) => o.type === "function_call");
      }

      return [];
    });

    if (functionCalls.length > 0) {
      functionCalls.forEach(call => {
        // each response.done.output entry has its own id
        const id = call.id ?? JSON.stringify(call);      // fallback if no id field
        if (processedCalls.current.has(id)) return;      // ← already handled
        processedCalls.current.add(id);                  // mark as processed

        const { name: functionName, arguments: functionArgsStr, result, call_id } = call;

        // Parse function arguments if they're a string
        let functionArgs;
        try {
          functionArgs = typeof functionArgsStr === 'string' ? JSON.parse(functionArgsStr) : functionArgsStr;
        } catch (e) {
          console.error(`❌ Failed to parse arguments for ${functionName}:`, e);
          if (sendClientEvent) {
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: call_id,
                output: JSON.stringify({ error: "Failed to parse function arguments" })
              }
            });
          }
          return;
        }

        // Detailed console logging for function calls
        console.log(`🔧 Agent called function: ${functionName}`);
        console.log(`📝 Arguments:`, JSON.stringify(functionArgs, null, 2));
        if (result) console.log(`✅ Result:`, result);
        
        // Add function call to chat messages
        setMessages(prevMessages => [
          ...prevMessages,
          {
            id: id,
            sender: "system",
            content: `🔧 Function: ${functionName}\n📝 Args: ${JSON.stringify(functionArgs, null, 2)}${result ? `\n✅ Result: ${JSON.stringify(result, null, 2)}` : ''}`
          }
        ]);

        try {
          let updatedGraph = elkGraph;
          
          // Ensure all required functions are available
          if (!addNode || !deleteNode || !moveNode || !addEdge || !deleteEdge || !groupNodes || !removeGroup) {
            throw new Error("Required graph manipulation functions are not available");
          }
          
          switch (functionName) {
            case "display_elk_graph":
              // Just return the current graph
              updatedGraph = { ...elkGraph };
              console.log(`⚪ Returning current graph with ${updatedGraph.children?.length || 0} top-level nodes`);
              break;
              
            case "add_node":
              updatedGraph = addNode(functionArgs.nodename, functionArgs.parentId, elkGraph);
              console.log(`🟢 Added node '${functionArgs.nodename}' to parent '${functionArgs.parentId}'`);
              break;
              
            case "delete_node":
              updatedGraph = deleteNode(functionArgs.nodeId, elkGraph);
              console.log(`🔴 Deleted node '${functionArgs.nodeId}'`);
              break;
              
            case "move_node":
              updatedGraph = moveNode(functionArgs.nodeId, functionArgs.newParentId, elkGraph);
              console.log(`🔄 Moved node '${functionArgs.nodeId}' to parent '${functionArgs.newParentId}'`);
              break;
              
            case "add_edge":
              updatedGraph = addEdge(functionArgs.edgeId, null, functionArgs.sourceId, functionArgs.targetId, elkGraph);
              console.log(`➡️ Added edge '${functionArgs.edgeId}' from '${functionArgs.sourceId}' to '${functionArgs.targetId}'`);
              break;
              
            case "delete_edge":
              updatedGraph = deleteEdge(functionArgs.edgeId, elkGraph);
              console.log(`✂️ Deleted edge '${functionArgs.edgeId}'`);
              break;
              
            case "group_nodes":
              updatedGraph = groupNodes(functionArgs.nodeIds, functionArgs.parentId, functionArgs.groupId, elkGraph);
              console.log(`📦 Grouped nodes [${functionArgs.nodeIds.join(', ')}] into '${functionArgs.groupId}' under '${functionArgs.parentId}'`);
              break;
              
            case "remove_group":
              updatedGraph = removeGroup(functionArgs.groupId, elkGraph);
              console.log(`📭 Removed group '${functionArgs.groupId}'`);
              break;
              
            default:
              console.warn(`⚠️ Unknown function call: ${functionName}`);
              return;
          }

          // Update the graph state
          if (setElkGraph) {
            setElkGraph(updatedGraph);
            console.log(`🔄 Graph state updated after ${functionName}`);
          }

          // Send function result back to the agent
          if (sendClientEvent) {
            console.log(`📤 Sending function result for ${functionName}...`);
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: call_id,
                output: JSON.stringify(updatedGraph)
              }
            });
            sendClientEvent({ type: "response.create" });
          }
        } catch (error: any) {
          console.error(`❌ Error in ${functionName} operation:`, error);
          
          // Send error response back to the agent
          if (sendClientEvent) {
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: call_id,
                output: JSON.stringify({ 
                  error: error?.message || 'Unknown error',
                  message: `Error in ${functionName} operation: ${error?.message || 'Unknown error'}. Current graph remains unchanged.`
                })
              }
            });
            console.error(`❌ Sent error response to agent for ${functionName}`);
          }
        }
      });
    }
  }, [events, isSessionActive, messages, elkGraph, setElkGraph, addNode, deleteNode, moveNode, addEdge, deleteEdge, groupNodes, removeGroup, agentInstruction, sendClientEvent]);

  // Initialize session with tool definitions
  useEffect(() => {
    if (initSentRef.current) return; // already done

    // wait until we actually have some events
    if (!events || events.length === 0) return;

    // look anywhere in the array, not only at the last item
    const hasSessionCreated = events.some(e => e.type === "session.created");

    if (!hasSessionCreated) return; // nothing to do yet

    console.log("Session created, starting chunked initialization...");
    
    if (!sendClientEvent) return;

    // 1. Define all tools in one array
    const allTools = [
      {
        type: "function",
        name: "display_elk_graph",
        description: "Function to display and return the current ELK graph layout",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        type: "function",
        name: "add_node",
        description: "Creates a new node and adds it under the given parent",
        parameters: {
          type: "object",
          properties: {
            nodename: {
              type: "string",
              description: "Name/ID of the new node to add"
            },
            parentId: {
              type: "string",
              description: "ID of the parent node where this node will be added"
            }
          },
          required: ["nodename", "parentId"]
        }
      },
      {
        type: "function",
        name: "delete_node",
        description: "Deletes a node from the layout and removes related edge references",
        parameters: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "ID of the node to delete"
            }
          },
          required: ["nodeId"]
        }
      },
      {
        type: "function",
        name: "move_node",
        description: "Moves a node from one parent to another and updates edge attachments",
        parameters: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "ID of the node to move"
            },
            newParentId: {
              type: "string",
              description: "ID of the new parent node"
            }
          },
          required: ["nodeId", "newParentId"]
        }
      },
      {
        type: "function",
        name: "add_edge",
        description: "Adds a new edge between two nodes at their common ancestor",
        parameters: {
          type: "object",
          properties: {
            edgeId: {
              type: "string",
              description: "Unique ID for the new edge"
            },
            sourceId: {
              type: "string",
              description: "ID of the source node"
            },
            targetId: {
              type: "string", 
              description: "ID of the target node"
            }
          },
          required: ["edgeId", "sourceId", "targetId"]
        }
      },
      {
        type: "function",
        name: "delete_edge",
        description: "Deletes an edge from the layout",
        parameters: {
          type: "object",
          properties: {
            edgeId: {
              type: "string",
              description: "ID of the edge to delete"
            }
          },
          required: ["edgeId"]
        }
      },
      {
        type: "function",
        name: "group_nodes",
        description: "Creates a new group node and moves specified nodes into it",
        parameters: {
          type: "object",
          properties: {
            nodeIds: {
              type: "array",
              items: { type: "string" },
              description: "Array of node IDs to group together"
            },
            parentId: {
              type: "string",
              description: "ID of the parent node that contains the nodes"
            },
            groupId: {
              type: "string",
              description: "ID/name for the new group node"
            }
          },
          required: ["nodeIds", "parentId", "groupId"]
        }
      },
      {
        type: "function",
        name: "remove_group",
        description: "Removes a group node by moving its children up to the parent",
        parameters: {
          type: "object",
          properties: {
            groupId: {
              type: "string",
              description: "ID of the group to remove"
            }
          },
          required: ["groupId"]
        }
      },
      {
        type: "function",
        name: "batch_update",
        description: "Executes a series of graph operations in order",
        parameters: {
          type: "object",
          properties: {
            operations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the operation to perform"
                  },
                  args: {
                    type: "object",
                    description: "Arguments for the operation"
                  }
                },
                required: ["name", "args"]
              },
              description: "List of operations to execute"
            }
          },
          required: ["operations"]
        }
      }
    ];
    
    // 2. Split tools into smaller pages
    const toolPages = chunkTools(allTools);
    console.log(`Splitting tools into ${toolPages.length} pages`);
    
    // 3. Send one session.update per page
    toolPages.forEach((toolPage, index) => {
      console.log(`Sending tool page ${index + 1}/${toolPages.length} (${JSON.stringify(toolPage).length} bytes)`);
      safeSendClientEvent({
        type: "session.update",
        session: {
          tools: toolPage,
          tool_choice: "auto",
        },
      });
    });
    
    // 4. Send the full description as a separate message
    console.log("Sending full description...");
    safeSendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
            You are a technical architecture diagram assistant. You can only interact with the system by calling the following functions:

            - display_elk_graph(title): Call this first to retrieve and visualize the current graph layout.
            - add_node(nodename, parentId): Add a component under a parent container. You cannot add a node if parentId doesnt exist.
            - delete_node(nodeId): Remove an existing node.
            - move_node(nodeId, newParentId): Move a node from one group/container to another.
            - add_edge(edgeId, sourceId, targetId): Connect two nodes with a directional link. You must place this edge inside the nearest common ancestor container.
            - delete_edge(edgeId): Remove an existing edge.
            - group_nodes(nodeIds, parentId, groupId): Create a new container and move specified nodes into it.
            - remove_group(groupId): Disband a group and promote its children to the parent.
            - batch_update(operations): Apply a list of operations to the graph. If applying batch operations make sure that nodes to which you are applying exist.

            You are not allowed to write explanations, instructions, or visual output. You must interact purely by calling functions to update the architecture diagram.
            `
          }
        ]
      }
    });
    
    // 5. Finally, prompt the model to respond
    safeSendClientEvent({ type: "response.create" });
    
    initSentRef.current = true;
  }, [events, safeSendClientEvent, elkGraphDescription]);

  // Handle chat submission
  const handleChatSubmit = useCallback((message: string) => {
    // Add the user message to the UI immediately
    const newMessage: Message = {
      id: Date.now().toString(),
      content: message,
      sender: "user",
    };
    
    setMessages((prev) => [...prev, newMessage]);
    
    // If there's a session, send the message to the AI
    if (isSessionActive && sendTextMessage) {
      setMessageSendStatus(prev => ({ ...prev, sending: true }));
      try {
        sendTextMessage(message);
        setMessageSendStatus(prev => ({ ...prev, sending: false, retryCount: 0, lastError: null }));
      } catch (error) {
        setMessageSendStatus(prev => ({ 
          ...prev, 
          sending: false, 
          retrying: true, 
          retryCount: prev.retryCount + 1,
          lastError: error as Error
        }));
      }
    } else {
      // If no session, show a message prompting to start a session
      setTimeout(() => {
        setMessages((prev) => [
          ...prev, 
          { 
            id: `system-${Date.now()}`, 
            content: "Please start a session to chat with the AI.", 
            sender: "assistant" 
          }
        ]);
      }, 500);
    }
  }, [isSessionActive, sendTextMessage]);

  return {
    messages,
    isSending,
    messageSendStatus,
    initSentRef,
    pendingMessagesRef,
    handleChatSubmit,
    processEvents,
    safeSendClientEvent
  };
}; 