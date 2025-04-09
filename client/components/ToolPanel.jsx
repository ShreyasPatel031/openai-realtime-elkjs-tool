import { useEffect, useState } from "react";
import ElkRender from "./ElkRender";
import { elkGraphDescription } from "./elkGraphDescription";
import ReactFlowGraph from "./ReactFlowGraph";
import {
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup
} from "../utils/graph_helper_functions";
import ELK from "elkjs/lib/elk.bundled.js";

// Helper function to find a node by ID
const findNodeById = (node, id) => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
};

// Create an initial ELK graph layout based on the description
const getInitialElkGraph = () => {
  // Directly return the simple graph
  return {
    "id": "root",
    "children": [
      { 
        "id": "ui",
        "labels": [{ "text": "UI" }],
        "children": [
          { 
            "id": "webapp",        
            "labels": [{ "text": "Web App" }]
          }
        ]
      },
      { 
        "id": "aws",
        "labels": [{ "text": "AWS" }],
        "children": [
          { 
            "id": "api",  
            "labels": [{ "text": "API" }]
          },
          { 
            "id": "lambda",
            "labels": [{ "text": "Lambda" }],
            "children": [
              { 
                "id": "query", 
                "labels": [{ "text": "Query" }]
              },
              { 
                "id": "pdf", 
                "labels": [{ "text": "PDF" }]
              },
              { 
                "id": "fetch", 
                "labels": [{ "text": "Fetch" }]
              },
              { 
                "id": "chat", 
                "labels": [{ "text": "Chat" }]
              }
            ],
            "edges": [
              { "id": "e6", "sources": [ "chat" ], "targets": [ "fetch" ] }
            ]
          },
          { 
            "id": "vector", 
            "labels": [{ "text": "Vector" }]
          },
          { 
            "id": "storage", 
            "labels": [{ "text": "Storage" }]
          }
        ],
        "edges": [
          { "id": "e1", "sources": [ "api" ], "targets": ["lambda" ] },
          { "id": "e2", "sources": [ "query" ], "targets": ["vector" ] },
          { "id": "e3", "sources": [ "pdf" ], "targets": ["vector" ] },
          { "id": "e4", "sources": [ "pdf" ], "targets": ["storage" ] },
          { "id": "e5", "sources": [ "fetch" ], "targets": ["storage" ] }
        ]
      },
      { 
        "id": "openai", 
        "labels": [{ "text": "OpenAI" }],
        "children": [
          { 
            "id": "embed", 
            "labels": [{ "text": "Embed" }]
          },
          { 
            "id": "chat_api", 
            "labels": [{ "text": "Chat API" }]
          }
        ]
      }
    ],
    "edges": [
      { "id": "e0", "sources": [ "webapp" ], "targets": [ "api" ] },
      { "id": "e7", "sources": [ "chat" ], "targets": ["chat_api" ] },
      { 
        "id": "e8", 
        "sources": [ "embed" ], 
        "targets": [ "query" ],
      },
      { 
        "id": "e9", 
        "sources": [ "embed" ], 
        "targets": [ "pdf" ],
      }
    ]
  };
};

const minimalSessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "display_elk_graph",
        description: "Function to display and return the current ELK graph layout",
        parameters: {
          type: "object",
          properties: {
            // No parameters needed as it simply returns the current graph state
          },
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
            oldParentId: {
              type: "string",
              description: "ID of the current parent node"
            },
            newParentId: {
              type: "string",
              description: "ID of the new parent node"
            }
          },
          required: ["nodeId", "oldParentId", "newParentId"]
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
      }
    ],
    tool_choice: "auto",
  },
};

function FunctionCallOutput({ title, elkGraph }) {
  if (!elkGraph) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold text-lg">{title}</h3>
      <div className="bg-white rounded-md p-4 border border-gray-200">
        <ElkRender 
          key={JSON.stringify(elkGraph)} 
          initialGraph={elkGraph} 
        />
      </div>
      <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
        {JSON.stringify(elkGraph, null, 2)}
      </pre>
    </div>
  );
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [graphTitle, setGraphTitle] = useState("ELK Graph Visualization");
  const [elkGraph, setElkGraph] = useState(getInitialElkGraph());
  const [activeTab, setActiveTab] = useState('elk');
  const [graphData, setGraphData] = useState(null);
  const elk = new ELK();

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      console.log("Session created, sending minimal update...");
      sendClientEvent(minimalSessionUpdate);
      
      // Send the full description in a separate message
      setTimeout(() => {
        console.log("Sending full description...");
        sendClientEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: `
                Under no circumstances should you say anything to the user, do not acknowledge their requests, do not explain your actions, just perform the actions they tell you to do.

                Here are the detailed instructions for creating and editing ELK.js graphs:\n\n${elkGraphDescription}\n\nYou can use the following tools to manipulate the graph:
                - display_elk_graph: Show the current graph
                - add_node: Add a new node to the graph
                - delete_node: Remove a node from the graph
                - move_node: Move a node to a different parent
                - add_edge: Create a connection between nodes
                - delete_edge: Remove a connection
                - group_nodes: Group multiple nodes together
                - remove_group: Ungroup nodes

                `
              }
            ]
          }
        });
        sendClientEvent({ type: "response.create" });
      }, 1000);
      
      setFunctionAdded(true);
    }

    const mostRecentEvent = events[0];
    if (
      mostRecentEvent.type === "response.done" && mostRecentEvent.response.output
    ) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          console.log("Agent output:", output);
          
          try {
            const args = JSON.parse(output.arguments);
            // console.log("Function call:", output.name, args);
            let updatedGraph = null;
            
            // Process each function based on its name
            switch(output.name) {
              case "display_elk_graph":
                try {
                  
                  // Return the current graph layout JSON
                  updatedGraph = { ...elkGraph };
                  setElkGraph(updatedGraph);
                  
                  // Add more debugging
                  console.log("Sending graph to agent:", JSON.stringify(updatedGraph).substring(0, 100) + "...");
                  
                  // Send the current graph layout JSON back to the agent
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Graph data: \n\`\`\`json\n${JSON.stringify(updatedGraph, null, 2)}\n\`\`\``
                        }
                      ]
                    }
                  });
                } catch (displayError) {
                  // Enhanced error logging with full details
                  console.error(`Error in display_elk_graph operation:`, displayError);
                  console.error(`Attempted to display graph layout`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in display_elk_graph operation: ${displayError.message}.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "add_node":
                try {
                  // Check if parent exists
                  const parent = findNodeById(elkGraph, args.parentId);
                  if (!parent) {
                    throw new Error(`Parent node '${args.parentId}' not found in the graph`);
                  }
                  
                  updatedGraph = addNode(args.nodename, args.parentId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (addNodeError) {
                  // Enhanced error logging with full details
                  console.error(`Error in add_node operation:`, addNodeError);
                  // console.error(`Error stack:`, addNodeError.stack);
                  console.error(`Attempted to add node '${args.nodename}' to parent '${args.parentId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_node operation: ${addNodeError.message}. Current graph remains unchanged. Check that the parent node exists.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "delete_node":
                try {
                  // Check if node exists before attempting to delete
                  const node = findNodeById(elkGraph, args.nodeId);
                  if (!node) {
                    throw new Error(`Node '${args.nodeId}' not found in the graph`);
                  }
                  
                  updatedGraph = deleteNode(args.nodeId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (deleteError) {
                  // Enhanced error logging with full details
                  console.error(`Error in delete_node operation:`, deleteError);
                  // console.error(`Error stack:`, deleteError.stack);
                  console.error(`Attempted to delete node '${args.nodeId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_node operation: ${deleteError.message}. Current graph remains unchanged. Check that the node exists.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "move_node":
                try {
                  // Check if the node exists
                  const node = findNodeById(elkGraph, args.nodeId);
                  if (!node) {
                    throw new Error(`Node '${args.nodeId}' not found in the graph`);
                  }
                  updatedGraph = moveNode(args.nodeId, args.newParentId, elkGraph);
                  console.log("Updated graph after move_node:", updatedGraph);
                  setElkGraph(updatedGraph);
                } catch (moveError) {
                  // Enhanced error logging with full details
                  console.error(`Error in move_node operation:`, moveError);
                  console.error(`Attempted to move node '${args.nodeId}' to '${args.newParentId}'`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in move_node operation: ${moveError.message}. Current graph remains unchanged. Check that the node exists.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "add_edge":
                try {
                  // Check if source and target nodes exist
                  const sourceNode = findNodeById(elkGraph, args.sourceId);
                  const targetNode = findNodeById(elkGraph, args.targetId);
                  
                  if (!sourceNode) {
                    throw new Error(`Source node '${args.sourceId}' not found in the graph`);
                  }
                  if (!targetNode) {
                    throw new Error(`Target node '${args.targetId}' not found in the graph`);
                  }
                  
                  updatedGraph = addEdge(args.edgeId, null, args.sourceId, args.targetId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (addEdgeError) {
                  // Enhanced error logging with full details
                  console.error(`Error in add_edge operation:`, addEdgeError);
                  // console.error(`Error stack:`, addEdgeError.stack);
                  console.error(`Attempted to add edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_edge operation: ${addEdgeError.message}. Current graph remains unchanged. Check that source and target nodes exist.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "delete_edge":
                try {
                  // Check if edge exists (need to find it in any node's edges array)
                  let edgeExists = false;
                  
                  const checkEdgeExists = (node) => {
                    if (node.edges) {
                      for (const edge of node.edges) {
                        if (edge.id === args.edgeId) {
                          edgeExists = true;
                          return;
                        }
                      }
                    }
                    if (node.children) {
                      for (const child of node.children) {
                        checkEdgeExists(child);
                        if (edgeExists) return;
                      }
                    }
                  };
                  
                  checkEdgeExists(elkGraph);
                  
                  if (!edgeExists) {
                    throw new Error(`Edge '${args.edgeId}' not found in the graph`);
                  }
                  
                  updatedGraph = deleteEdge(args.edgeId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (deleteEdgeError) {
                  // Enhanced error logging with full details
                  console.error(`Error in delete_edge operation:`, deleteEdgeError);
                  // console.error(`Error stack:`, deleteEdgeError.stack);
                  console.error(`Attempted to delete edge '${args.edgeId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_edge operation: ${deleteEdgeError.message}. Current graph remains unchanged. Check that the edge exists.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "group_nodes":
                try {
                  // Check if parent and all nodes exist
                  const parent = findNodeById(elkGraph, args.parentId);
                  if (!parent) {
                    throw new Error(`Parent node '${args.parentId}' not found in the graph`);
                  }
                  
                  for (const nodeId of args.nodeIds) {
                    const node = findNodeById(elkGraph, nodeId);
                    if (!node) {
                      throw new Error(`Node '${nodeId}' not found in the graph`);
                    }
                  }
                  
                  updatedGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (groupNodesError) {
                  // Enhanced error logging with full details
                  console.error(`Error in group_nodes operation:`, groupNodesError);
                  // console.error(`Error stack:`, groupNodesError.stack);
                  console.error(`Attempted to group nodes '${args.nodeIds}' under parent '${args.parentId}' into group '${args.groupId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in group_nodes operation: ${groupNodesError.message}. Current graph remains unchanged. Check that parent and all nodes exist.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "remove_group":
                try {
                  // Check if group exists
                  const group = findNodeById(elkGraph, args.groupId);
                  if (!group) {
                    throw new Error(`Group '${args.groupId}' not found in the graph`);
                  }
                  
                  updatedGraph = removeGroup(args.groupId, elkGraph);
                  setElkGraph(updatedGraph);
                } catch (removeGroupError) {
                  // Enhanced error logging with full details
                  console.error(`Error in remove_group operation:`, removeGroupError);
                  // console.error(`Error stack:`, removeGroupError.stack);
                  console.error(`Attempted to remove group '${args.groupId}'`);
                  // console.error(`Current graph:`, elkGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in remove_group operation: ${removeGroupError.message}. Current graph remains unchanged. Check that the group exists.`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
            }
            
            // At this point, no errors happened in any of the cases
            // Store the data for ReactFlow
            setGraphData({ title: graphTitle, graph: updatedGraph || elkGraph });
            
            // Return the updated graph to the agent
            sendClientEvent({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph || elkGraph)}`
                  }
                ]
              }
            });
            
            // Prompt for another interaction
            setTimeout(() => {
              sendClientEvent({
                type: "response.create",
              });
            }, 1000);
            
          } catch (parseError) {
            console.error("Error parsing function arguments:", parseError);
            console.error("Raw arguments:", output.arguments);
            
            // Log the error detail for debugging
            console.log(`Error parsing function arguments for ${output.name}:`, parseError);
            
            // Return the parse error to the agent
            sendClientEvent({
              type: "conversation.item.create", 
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `Error parsing function arguments for ${output.name}: ${parseError.message}. Please check your input format.`
                  }
                ]
              }
            });
            
            // Prompt for another interaction
            setTimeout(() => {
              sendClientEvent({
                type: "response.create", 
              });
            }, 1000);
          }
        }
      });
    }
  }, [events, elkGraph]);

  useEffect(() => {
    if (!isSessionActive) {
      setFunctionAdded(false);
      setElkGraph(getInitialElkGraph());
      setGraphData(null);
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold mb-4">AI Tools</h2>
        
        {/* Tabs */}
        <div className="flex border-b mb-4">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'elk'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('elk')}
          >
            Elk Graph
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'reactflow'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('reactflow')}
          >
            ReactFlow
          </button>
        </div>
        
        {/* Tab Content */}
        {isSessionActive ? (
          elkGraph ? (
            activeTab === 'elk' ? (
              <FunctionCallOutput title={graphTitle} elkGraph={elkGraph} />
            ) : (
              <div>
                <h3 className="text-lg font-medium mb-2">ReactFlow Visualization</h3>
                <div className="border rounded p-4 bg-white h-[500px]">
                  {graphData ? (
                    <ReactFlowGraph graphData={graphData} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No graph data available
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div>
              <p className="mb-2">Initializing graph...</p>
            </div>
          )
        ) : (
          <p>Start the session to use these tools...</p>
        )}
      </div>
    </section>
  );
}
