// Simple working tool catalog for server-side use
export const allTools = [
  {
    type: "function",
    function: {
      name: "batch_update",
      description: "Add/update multiple nodes and create groups in a single operation",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            description: "Array of operations to perform",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  enum: ["add_node", "update_node", "group_nodes"]
                },
                nodename: { type: "string" },
                parentId: { type: "string" },
                data: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    icon: { type: "string" }
                  }
                },
                nodeIds: {
                  type: "array",
                  items: { type: "string" }
                },
                groupId: { type: "string" },
                groupIconName: { type: "string" }
              }
            }
          }
        },
        required: ["operations"]
      }
    }
  }
]; 