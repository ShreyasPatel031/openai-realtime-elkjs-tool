// client/realtime/initSession.ts
import { toolPages } from "./toolCatalog";

// Define simplified session configuration interface
interface SessionConfig {
  language?: string;
  temperature?: number;
  model?: string;
  instructions?: string;
}

export function initSession(
  events: any[],
  safeSend: (e: object) => void,
  elkGraphDescription: string,
  config?: SessionConfig
) {
  const hasSessionCreated = events.some((e) => e.type === "session.created");
  if (!hasSessionCreated) return false;        // caller will know it did nothing

  console.log("Session created, starting chunked initialization…");
  
  // Apply simplified session configuration if provided
  if (config) {
    const sessionConfig: any = {};
    
    // Add the core configuration options
    if (config.language) sessionConfig.language = config.language;
    if (config.temperature) sessionConfig.temperature = config.temperature;
    if (config.model) sessionConfig.model = config.model;
    if (config.instructions) sessionConfig.instructions = config.instructions;
    
    // Send initial session configuration
    safeSend({ 
      type: "session.update", 
      session: sessionConfig
    });
  }
  
  // Send tool configuration
  toolPages().forEach((page, i, arr) => {
    console.log(`page ${i + 1}/${arr.length}`);
    safeSend({ 
      type: "session.update", 
      session: { 
        tools: page,
        tool_choice: "auto"
      } 
    });
  });

  // If language is provided, include instructions to use that language
  const languageInstruction = config?.language ? 
    `You must respond only in ${config.language}. Do not switch to any other language.` : '';

  safeSend({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: `
            ${languageInstruction}
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
            `,
        },
      ],
    },
  });

  safeSend({ type: "response.create" });
  return true;                                   // did send
} 