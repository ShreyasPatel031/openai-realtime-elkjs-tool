import { chunkTools } from "../utils/splitTools.js";

// Import dynamic agent resources generated at build time
import { 
  availableGroupIcons, 
  groupIconInstructions 
} from "../generated/dynamicAgentResources";

export const allTools = [
  {
    type: "function",
    name: "log_requirements_and_generate_questions",
    description: "Log user requirements and generate 3-4 contextual follow-up questions",
    parameters: {
      type: "object",
      properties: {
        requirements: {
          type: "array",
          description: "Array of user requirements/decisions/constraints",
          items: {
            type: "string"
          }
        },
        questions: {
          type: "array",
          description: "Array of 3-4 follow-up question objects",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["select", "multiselect"],
                description: "Type of question - select for single choice, multiselect for multiple choices"
              },
              text: {
                type: "string",
                description: "The question text (keep concise)"
              },
              options: {
                type: "array",
                description: "Array of answer options",
                items: {
                  type: "string"
                }
              },
              impact: {
                type: "string",
                description: "How this question affects the architecture decisions"
              }
            },
            required: ["type", "text", "options", "impact"]
          }
        }
      },
      required: ["requirements", "questions"]
    }
  },
  {
    type: "function",
    name: "display_elk_graph",
    description: "Update and display the ELK graph visualization",
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
        },
        data: {
          type: "object",
          description: "Additional data for the node",
          properties: {
            label: {
              type: "string",
              description: "Display label for the node (defaults to nodename if not provided)"
            },
            icon: {
              type: "string",
              description: "Icon name to display for the node (e.g., 'browser_client', 'mobile_app', 'cloud_cdn', etc.)"
            },
            groupIcon: {
                  type: "string",
              description: "Group icon name for visual theming with proper cloud provider colors. Use group icons for logical containers.",
              enum: availableGroupIcons
            }
          }
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
    description: "Moves a node from one parent to another and updates edge attachments. IMPORTANT: When moving a node into a leaf node (node with no children), an automatic neutral group will be created containing both nodes using 'gcp_system' group icon.",
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
        },
        label: {
          type: "string",
          description: "Optional descriptive label for the edge"
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
    description: `Creates a new group node and moves specified nodes into it with group icon styling for proper cloud provider theming. ${groupIconInstructions}`,
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
        groupIconName: {
          type: "string",
          description: "Group icon name for visual theming and background colors. REQUIRED for proper cloud provider styling. Choose appropriate provider icon (aws_, gcp_, azure_).",
          enum: availableGroupIcons
        }
      },
      required: ["nodeIds", "parentId", "groupId", "groupIconName"]
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
    description: "Executes a series of graph operations in order. CRITICAL: You must pass { operations: [...] } structure. NEVER pass a graph object with id/children/edges. Format: batch_update({ operations: [{ name: \"add_node\", nodename: \"web-server\", parentId: \"root\" }] })",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description: "REQUIRED: Array of operations to execute. Each operation must have 'name' field. Do NOT pass a graph object here!",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name of the operation to perform (add_node, delete_node, move_node, add_edge, delete_edge, group_nodes, remove_group)",
                enum: ["add_node", "delete_node", "move_node", "add_edge", "delete_edge", "group_nodes", "remove_group"]
              },
              nodename: {
                type: "string",
                description: "For add_node: Name/ID of the new node to add"
              },
              parentId: {
                type: "string",
                description: "For add_node or group_nodes: ID of the parent node where this node will be added"
              },
              nodeId: {
                type: "string",
                description: "For delete_node or move_node: ID of the node to operate on"
              },
              newParentId: {
                type: "string",
                description: "For move_node: ID of the new parent node"
              },
              edgeId: {
                type: "string",
                description: "For add_edge or delete_edge: ID of the edge"
              },
              sourceId: {
                type: "string",
                description: "For add_edge: ID of the source node"
              },
              targetId: {
                type: "string",
                description: "For add_edge: ID of the target node"
              },
              nodeIds: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "For group_nodes: IDs of the nodes to group"
              },
              groupId: {
                type: "string",
                description: "For group_nodes or remove_group: ID of the group"
              },
              groupIconName: {
                type: "string",
                description: "For group_nodes: REQUIRED group icon name for proper cloud provider styling",
                enum: availableGroupIcons
              },
              data: {
                type: "object",
                description: "For add_node: Additional node data including groupIcon"
              },
                  label: {
                    type: "string",
                description: "For add_edge: Optional edge label"
              }
            },
            required: ["name"]
          }
        }
      },
      required: ["operations"]
    }
  }
];

export function toolPages() {
  return chunkTools(allTools);
} 