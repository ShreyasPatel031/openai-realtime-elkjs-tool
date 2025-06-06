import { useEffect, useState, useRef } from "react";
import ElkRender from "../test/ElkRender";
import { createElkGraphFromFunctionCall } from "../test/elkGraphDescription";
import ReactFlowGraph from "../test/ReactFlowGraph";
import {
  addNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
  groupNodes,
  removeGroup,
  batchUpdate
} from "../../utils/graph_helper_functions";
import ELK from "elkjs/lib/elk.bundled.js";
import { elkGraphDescription, agentInstruction } from "../../realtime/agentConfig";

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
        description: "Creates a new group node and moves specified nodes into it with optional group icon styling",
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
            },
            style: {
              type: "string",
              description: "Optional style color scheme for the group"
            },
            groupIconName: {
              type: "string",
              description: "Optional group icon name for visual theming and background colors"
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
  const [layoutedElkGraph, setLayoutedElkGraph] = useState(null);
  const elk = new ELK();
  const layoutProcessingRef = useRef(false);
  const lastLayoutHashRef = useRef(null);
  const layoutTimeoutRef = useRef(null);

  // Helper function to get a stable hash of the graph layout (ignoring ELK internal props)
  const getLayoutHash = (graph) => {
    if (!graph) return '';
    
    // Get a stable representation by only including relevant properties
    // Recursively process the graph to remove internal ELK properties like $H
    const cleanGraph = (node) => {
      if (!node) return null;
      
      const cleanNode = {
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      };
      
      if (node.labels) {
        cleanNode.labels = node.labels.map(label => ({
          text: label.text,
          x: label.x,
          y: label.y
        }));
      }
      
      if (node.children && node.children.length > 0) {
        cleanNode.children = node.children.map(child => cleanGraph(child));
      }
      
      if (node.edges && node.edges.length > 0) {
        cleanNode.edges = node.edges.map(edge => ({
          id: edge.id,
          sources: [...edge.sources],
          targets: [...edge.targets],
          sections: edge.sections ? edge.sections.map(section => ({
            startPoint: section.startPoint ? { x: section.startPoint.x, y: section.startPoint.y } : null,
            endPoint: section.endPoint ? { x: section.endPoint.x, y: section.endPoint.y } : null,
            bendPoints: section.bendPoints ? section.bendPoints.map(point => ({ 
              x: point.x, 
              y: point.y 
            })) : []
          })) : []
        }));
      }
      
      return cleanNode;
    };
    
    // Create a stable hash of the graph's layout-relevant properties
    const cleanedGraph = cleanGraph(graph);
    return JSON.stringify(cleanedGraph);
  };

  // Process the graph when it changes or when active tab changes
  useEffect(() => {
    // Reset the layout processing state when we switch to ReactFlow tab
    if (activeTab === 'reactflow') {
      console.log("Switching to ReactFlow tab, resetting layout state");
      layoutProcessingRef.current = false;
      
      // Force a re-layout if needed
      if (elkGraph && !layoutedElkGraph) {
        setLayoutedElkGraph(null);
      }
      
      // Set a safety timeout to reset the processing state if it gets stuck
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
      }
      
      layoutTimeoutRef.current = setTimeout(() => {
        if (layoutProcessingRef.current) {
          console.log("Layout processing took too long, resetting state");
          layoutProcessingRef.current = false;
        }
      }, 5000); // 5 second timeout
    } else {
      // If we switch to any other tab, we want to make sure the layout processing state is reset
      // so when we come back to ReactFlow, it will process again if needed
      layoutProcessingRef.current = false;
      
      // Clear any pending timeout
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
        layoutTimeoutRef.current = null;
      }
    }
    
    // Cleanup the timeout when the component unmounts or the effect reruns
    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current);
        layoutTimeoutRef.current = null;
      }
    };
  }, [activeTab, elkGraph, layoutedElkGraph]);

  useEffect(() => {
    if (!events || events.length === 0) return;

    const firstEvent = events[events.length - 1];
    if (!functionAdded && firstEvent.type === "session.created") {
      // Reduced logging for session creation
      sendClientEvent(minimalSessionUpdate);
      
      // Send the full description in a separate message
      setTimeout(() => {
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

                You can use the following tools to manipulate the graph:
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
          // Reduced logging for function calls
          
          try {
            const args = JSON.parse(output.arguments);
            let updatedGraph = null;
            
            // Process each function based on its name
            switch(output.name) {
              case "display_elk_graph":
                try {
                  updatedGraph = { ...elkGraph };
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (displayError) {
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
                          text: `Error in display_elk_graph operation: ${displayError.message}.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "add_node":
                try {
                  updatedGraph = addNode(args.nodename, args.parentId, elkGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (addError) {
                  console.error(`Error in add_node operation:`, addError);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_node operation: ${addError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "delete_node":
                try {
                  updatedGraph = deleteNode(args.nodeId, elkGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (deleteError) {
                  console.error(`Error in delete_node operation:`, deleteError);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_node operation: ${deleteError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "move_node":
                try {
                  const node = findNodeById(elkGraph, args.nodeId);
                  if (!node) {
                    throw new Error(`Node '${args.nodeId}' not found in the graph`);
                  }
                  updatedGraph = moveNode(args.nodeId, args.newParentId, elkGraph);
                  console.log("Updated graph after move_node:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (moveError) {
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
                          text: `Error in move_node operation: ${moveError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "add_edge":
                try {
                  updatedGraph = addEdge(args.edgeId, args.sourceId, args.targetId, elkGraph);
                  console.log("Updated graph after add_edge:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (addEdgeError) {
                  console.error(`Error in add_edge operation:`, addEdgeError);
                  console.error(`Attempted to add edge '${args.edgeId}' from '${args.sourceId}' to '${args.targetId}'`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in add_edge operation: ${addEdgeError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "delete_edge":
                try {
                  updatedGraph = deleteEdge(args.edgeId, elkGraph);
                  console.log("Updated graph after delete_edge:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (deleteEdgeError) {
                  console.error(`Error in delete_edge operation:`, deleteEdgeError);
                  console.error(`Attempted to delete edge '${args.edgeId}'`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in delete_edge operation: ${deleteEdgeError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "group_nodes":
                try {
                  // Validate required parameters
                  if (!args.nodeIds || !Array.isArray(args.nodeIds) || args.nodeIds.length === 0) {
                    throw new Error(`group_nodes requires 'nodeIds' as a non-empty array, got: ${JSON.stringify(args.nodeIds)}`);
                  }
                  if (!args.parentId || typeof args.parentId !== 'string') {
                    throw new Error(`group_nodes requires 'parentId' as a string, got: ${JSON.stringify(args.parentId)}`);
                  }
                  if (!args.groupId || typeof args.groupId !== 'string') {
                    throw new Error(`group_nodes requires 'groupId' as a string, got: ${JSON.stringify(args.groupId)}`);
                  }
                  if (!args.groupIconName || typeof args.groupIconName !== 'string') {
                    throw new Error(`group_nodes requires 'groupIconName' as a string for proper cloud provider styling, got: ${JSON.stringify(args.groupIconName)}`);
                  }
                  
                  updatedGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, elkGraph, undefined, args.groupIconName);
                  console.log("Updated graph after group_nodes:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (groupError) {
                  console.error(`Error in group_nodes operation:`, groupError);
                  console.error(`Attempted to group nodes '${args.nodeIds.join(", ")}' under '${args.parentId}' with group ID '${args.groupId}'`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in group_nodes operation: ${groupError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "remove_group":
                try {
                  updatedGraph = removeGroup(args.groupId, elkGraph);
                  console.log("Updated graph after remove_group:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded. Updated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                } catch (removeGroupError) {
                  console.error(`Error in remove_group operation:`, removeGroupError);
                  console.error(`Attempted to remove group '${args.groupId}'`);
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in remove_group operation: ${removeGroupError.message}. Current graph remains unchanged.\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  return;
                }
                break;
                
              case "batch_update":
                try {
                  console.log("Batch update called with operations:", args.operations);
                  
                  // Normalize operations to have consistent structure
                  const normalizedOperations = args.operations.map(operation => {
                    // If operation already has args property, keep it as is
                    if (operation.args) {
                      return operation;
                    }
                    
                    // If operation has parameters property, use that as args
                    if (operation.parameters) {
                      return { name: operation.name, args: operation.parameters };
                    }
                    
                    // Otherwise, extract name and create args from remaining properties excluding name
                    const { name, parameters, args, ...restProps } = operation;
                    return { name, args: Object.keys(restProps).length > 0 ? restProps : {} };
                  });
                  
                  // Add debug log before executing batch
                  console.log("Normalized operations:", normalizedOperations);
                  
                  // Execute operations one by one, collecting results and errors
                  let updatedGraph = { ...elkGraph };
                  const results = [];
                  
                  for (let i = 0; i < normalizedOperations.length; i++) {
                    const operation = normalizedOperations[i];
                    const { name, args: opArgs } = operation;
                    
                    try {
                      // Validate and execute each operation
                      switch(name) {
                        case "add_node":
                          if (!findNodeById(updatedGraph, opArgs.parentId)) {
                            throw new Error(`Parent node '${opArgs.parentId}' not found for add_node operation`);
                          }
                          updatedGraph = addNode(opArgs.nodename, opArgs.parentId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "delete_node":
                          if (!findNodeById(updatedGraph, opArgs.nodeId)) {
                            throw new Error(`Node '${opArgs.nodeId}' not found for delete_node operation`);
                          }
                          updatedGraph = deleteNode(opArgs.nodeId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "move_node":
                          const nodeToMove = findNodeById(updatedGraph, opArgs.nodeId);
                          const newParent = findNodeById(updatedGraph, opArgs.newParentId);
                          if (!nodeToMove) {
                            throw new Error(`Node '${opArgs.nodeId}' not found for move_node operation`);
                          }
                          if (!newParent) {
                            throw new Error(`New parent node '${opArgs.newParentId}' not found for move_node operation`);
                          }
                          updatedGraph = moveNode(opArgs.nodeId, opArgs.newParentId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "add_edge":
                          if (!findNodeById(updatedGraph, opArgs.sourceId)) {
                            throw new Error(`Source node '${opArgs.sourceId}' not found for add_edge operation`);
                          }
                          if (!findNodeById(updatedGraph, opArgs.targetId)) {
                            throw new Error(`Target node '${opArgs.targetId}' not found for add_edge operation`);
                          }
                          updatedGraph = addEdge(opArgs.edgeId, opArgs.sourceId, opArgs.targetId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "delete_edge":
                          let edgeExists = false;
                          const checkEdgeExists = (node) => {
                            if (node.edges) {
                              for (const edge of node.edges) {
                                if (edge.id === opArgs.edgeId) {
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
                          checkEdgeExists(updatedGraph);
                          if (!edgeExists) {
                            throw new Error(`Edge '${opArgs.edgeId}' not found for delete_edge operation`);
                          }
                          updatedGraph = deleteEdge(opArgs.edgeId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "group_nodes":
                          if (!findNodeById(updatedGraph, opArgs.parentId)) {
                            throw new Error(`Parent node '${opArgs.parentId}' not found for group_nodes operation`);
                          }
                          for (const nodeId of opArgs.nodeIds) {
                            if (!findNodeById(updatedGraph, nodeId)) {
                              throw new Error(`Node '${nodeId}' not found for group_nodes operation`);
                            }
                          }
                          updatedGraph = groupNodes(opArgs.nodeIds, opArgs.parentId, opArgs.groupId, updatedGraph, undefined, opArgs.groupIconName);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        case "remove_group":
                          if (!findNodeById(updatedGraph, opArgs.groupId)) {
                            throw new Error(`Group '${opArgs.groupId}' not found for remove_group operation`);
                          }
                          updatedGraph = removeGroup(opArgs.groupId, updatedGraph);
                          results.push({ operation: i, name, status: "success" });
                          break;
                          
                        default:
                          throw new Error(`Unknown operation: ${name}`);
                      }
                    } catch (operationError) {
                      console.error(`Error in operation ${i} (${name}):`, operationError);
                      results.push({ 
                        operation: i, 
                        name, 
                        status: "error", 
                        error: operationError.message 
                      });
                    }
                  }
                  
                  // Update the graph with whatever operations succeeded
                  console.log("Updated graph after batch_update:", updatedGraph);
                  setElkGraph(updatedGraph);
                  
                  // Generate a summary of the results
                  const successCount = results.filter(r => r.status === "success").length;
                  const errorCount = results.filter(r => r.status === "error").length;
                  const errorMessages = results
                    .filter(r => r.status === "error")
                    .map(r => `Operation ${r.operation} (${r.name}): ${r.error}`)
                    .join("\n");
                  
                  // Send a detailed response
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Function call ${output.name} succeeded with ${successCount} successes and ${errorCount} errors.
${errorCount > 0 ? `\nErrors:\n${errorMessages}` : ''}
\nUpdated graph structure: ${JSON.stringify(updatedGraph)}\n\n${agentInstruction}`
                        }
                      ]
                    }
                  });
                  
                } catch (batchError) {
                  // This should only happen for errors outside the operation loop
                  console.error(`Error in batch_update operation:`, batchError);
                  console.error(`Attempted batch operations:`, args.operations);
                  
                  sendClientEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "message", 
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Error in batch_update operation: ${batchError.message}. Current graph remains unchanged.`
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
                <div className="border rounded p-4 bg-white h-[600px]">
                  {elkGraph ? (
                    <>
                      {/* The hidden ElkRender component does all the layout work */}
                      <div style={{ display: 'none' }}>
                        <ElkRender 
                          key={`elk-renderer-${activeTab === 'reactflow' ? 'active' : 'inactive'}-${elkGraph ? elkGraph.id : 'empty'}`}
                          initialGraph={elkGraph} 
                          onLayoutComplete={(layoutedGraph) => {
                            // Only process if we're on the ReactFlow tab
                            if (activeTab !== 'reactflow') {
                              layoutProcessingRef.current = false;
                              return;
                            }
                            
                            console.log("ToolPanel: Received layouted graph from ElkRender");
                            
                            // Generate a stable layout hash
                            const newLayoutHash = getLayoutHash(layoutedGraph);
                            
                            // Only update state if the layout actually changed
                            if (newLayoutHash !== lastLayoutHashRef.current) {
                              lastLayoutHashRef.current = newLayoutHash;
                              setLayoutedElkGraph(layoutedGraph);
                            }
                            
                            layoutProcessingRef.current = false;
                          }}
                        />
                      </div>
                      
                      {/* We only show ReactFlow when we have a layouted graph */}
                      {layoutedElkGraph ? (
                        <ReactFlowGraph 
                          graphData={layoutedElkGraph} 
                          key="layouted-graph"
                        />
                      ) : elkGraph ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-gray-500">
                            {/* Set layout processing to true when showing this message */}
                            {(() => { layoutProcessingRef.current = true; return null; })()}
                            Processing layout...
                            <button 
                              className="ml-2 px-2 py-1 bg-blue-500 text-white rounded text-xs"
                              onClick={() => {
                                // Manual reset if processing gets stuck
                                layoutProcessingRef.current = false;
                                // Force a re-layout
                                setLayoutedElkGraph(null);
                              }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          No graph data available
                        </div>
                      )}
                    </>
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
