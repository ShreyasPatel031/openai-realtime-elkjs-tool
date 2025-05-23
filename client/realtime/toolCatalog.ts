import { chunkTools } from "../utils/splitTools.js";

export const allTools = [
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
            style: {
              type: ["object", "string"],
              description: "Style for the node. Can be a predefined style name (GREEN, BLUE, YELLOW, PURPLE, TEAL, GREY) or a custom style object.",
              oneOf: [
                {
                  type: "string",
                  enum: ["GREEN", "BLUE", "YELLOW", "PURPLE", "TEAL", "GREY"],
                  description: "Predefined style name"
                },
                {
                  type: "object",
                  properties: {
                    bg: {
                      type: "string",
                      description: "Background color"
                    },
                    border: {
                      type: "string",
                      description: "Border color"
                    }
                  },
                  description: "Custom style object"
                }
              ]
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
        },
        style: {
          type: "string",
          description: "Style color scheme for the group (e.g., 'GREEN', 'BLUE', 'YELLOW', 'PURPLE', 'TEAL', 'GREY'). These correspond to predefined color schemes in the application.",
          enum: ["GREEN", "BLUE", "YELLOW", "PURPLE", "TEAL", "GREY"]
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
              label: {
                type: "string",
                description: "For add_edge: Optional descriptive label for the edge"
              },
              style: {
                type: "string",
                description: "For group_nodes: Style color scheme for the group (GREEN, BLUE, YELLOW, PURPLE, TEAL, GREY). These correspond to predefined color schemes in the application.",
                enum: ["GREEN", "BLUE", "YELLOW", "PURPLE", "TEAL", "GREY"]
              },
              data: {
                type: "object",
                description: "For add_node: Additional data for the node",
                properties: {
                  label: {
                    type: "string",
                    description: "Display label for the node (defaults to nodename if not provided)"
                  },
                  icon: {
                    type: "string",
                    description: "Icon name to display for the node (e.g., 'browser_client', 'mobile_app', 'cloud_cdn', etc.)"
                  },
                  style: {
                    type: ["object", "string"],
                    description: "Style for the node. Can be a predefined style name (GREEN, BLUE, YELLOW, PURPLE, TEAL, GREY) or a custom style object.",
                    oneOf: [
                      {
                        type: "string",
                        enum: ["GREEN", "BLUE", "YELLOW", "PURPLE", "TEAL", "GREY"],
                        description: "Predefined style name"
                      },
                      {
                        type: "object",
                        properties: {
                          bg: {
                            type: "string",
                            description: "Background color"
                          },
                          border: {
                            type: "string",
                            description: "Border color"
                          }
                        },
                        description: "Custom style object"
                      }
                    ]
                  }
                }
              }
            },
            required: ["name"]
          },
          description: "List of operations to execute"
        }
      },
      required: ["operations"]
    }
  }
];

export function toolPages() {
  return chunkTools(allTools);
} 