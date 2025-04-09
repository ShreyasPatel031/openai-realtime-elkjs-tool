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

// Create an initial ELK graph layout based on the description
const getInitialElkGraph = () => {
  // Parse the example graph from elkGraphDescription
  const descriptionText = elkGraphDescription;
  const graphStartIndex = descriptionText.indexOf('{');
  const graphEndIndex = descriptionText.lastIndexOf('}');
  
  if (graphStartIndex > -1 && graphEndIndex > -1) {
    try {
      const graphJson = descriptionText.substring(graphStartIndex, graphEndIndex + 1);
      return JSON.parse(graphJson);
    } catch (error) {
      console.error("Error parsing initial graph:", error);
    }
  }
  
  // Fallback to a simple graph if parsing fails
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
        description: "Function to display the current ELK graph layout",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title for the graph visualization",
            }
          },
          required: ["title"]
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
        <ElkRender initialGraph={elkGraph} />
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

  const updateGraphLayout = async (graph) => {
    try {
      const layout = await elk.layout(graph);
      setElkGraph(layout);
    } catch (error) {
      console.error("Error updating graph layout:", error);
    }
  };

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      console.log("Session created, sending minimal update...");
      sendClientEvent(minimalSessionUpdate);
      
      // Initialize the ELK graph
      updateGraphLayout(getInitialElkGraph());
      
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
                text: `Here are the detailed instructions for creating and editing ELK.js graphs:\n\n${elkGraphDescription}\n\nYou can use the following tools to manipulate the graph:
                - display_elk_graph: Show the current graph
                - add_node: Add a new node to the graph
                - delete_node: Remove a node from the graph
                - move_node: Move a node to a different parent
                - add_edge: Create a connection between nodes
                - delete_edge: Remove a connection
                - group_nodes: Group multiple nodes together
                - remove_group: Ungroup nodes

                Try to manipulate the graph by adding a new service component!`
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
      mostRecentEvent.type === "response.done" &&
      mostRecentEvent.response.output
    ) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          console.log("Agent output:", output);
          
          try {
            const args = JSON.parse(output.arguments);
            console.log("Function call:", output.name, args);
            
            // Process each function based on its name
            switch(output.name) {
              case "display_elk_graph":
                if (args.title) {
                  setGraphTitle(args.title);
                }
                // Use current graph state, no changes
                break;
                
              case "add_node":
                setElkGraph(currentGraph => {
                  const updatedGraph = addNode(args.nodename, args.parentId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "delete_node":
                setElkGraph(currentGraph => {
                  const updatedGraph = deleteNode(args.nodeId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "move_node":
                setElkGraph(currentGraph => {
                  const updatedGraph = moveNode(args.nodeId, args.oldParentId, args.newParentId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "add_edge":
                setElkGraph(currentGraph => {
                  const updatedGraph = addEdge(args.edgeId, null, args.sourceId, args.targetId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "delete_edge":
                setElkGraph(currentGraph => {
                  const updatedGraph = deleteEdge(args.edgeId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "group_nodes":
                setElkGraph(currentGraph => {
                  const updatedGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
                
              case "remove_group":
                setElkGraph(currentGraph => {
                  const updatedGraph = removeGroup(args.groupId, currentGraph);
                  updateGraphLayout(updatedGraph);
                  return updatedGraph;
                });
                break;
            }
            
            // Store the data for ReactFlow
            setGraphData({ title: graphTitle, graph: elkGraph });
            
            // Prompt for another interaction
            setTimeout(() => {
              sendClientEvent({
                type: "response.create",
              });
            }, 1000);
            
          } catch (error) {
            console.error("Error processing function call:", error);
            console.error("Raw arguments:", output.arguments);
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
