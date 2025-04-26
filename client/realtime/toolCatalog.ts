import { chunkTools } from "../utils/splitTools";

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

export function toolPages() {
  return chunkTools(allTools);
} 