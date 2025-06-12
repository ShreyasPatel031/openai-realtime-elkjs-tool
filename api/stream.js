import OpenAI from "openai";

const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 60000, // 60 seconds
  httpAgent: undefined // Let Node.js handle keep-alive
});

// Group Icons for architecture grouping and containers
const availableGroupIcons = [
  "aws_account", "aws_auto_scaling_group", "aws_cloud", "aws_corporate_datacenter", 
  "aws_ec2_instance_contents", "aws_private_subnet", "aws_public_subnet", "aws_region", 
  "aws_server_contents", "aws_spot_fleet", "aws_vpc", "gcp_user_default", "gcp_system",
  "gcp_infrastructure_system", "gcp_external_saas_providers", "gcp_external_data_sources",
  "gcp_colo_dc_onpremises", "gcp_external_infrastructure_3rd_party", 
  "gcp_external_infrastructure_1st_party", "gcp_project_zone_cloud_service_provider",
  "gcp_logical_grouping_services_instances", "gcp_zone_inside_logical_grouping",
  "gcp_subnetwork", "gcp_kubernetes_cluster", "gcp_pod", "gcp_account", "gcp_region",
  "gcp_zone_inside_region", "gcp_firewall", "gcp_instance_group", "gcp_replica_pool",
  "gcp_optional_component_dashed", "azure_subscription_filled", "azure_subscription_border",
  "azure_resource_group_filled", "azure_resource_group_border", "azure_virtual_network_filled",
  "azure_virtual_network_border", "azure_subnet_filled", "azure_subnet_border",
  "azure_availability_zone_filled", "azure_availability_zone_border", "azure_region_filled",
  "azure_region_border", "azure_tenant_filled", "azure_tenant_border",
  "azure_management_group_filled", "azure_management_group_border",
  "azure_application_group_filled", "azure_application_group_border",
  "azure_security_group_filled"
];

const groupIconInstructions = `
📦 GROUP ICONS (51 available)
Group icons are used for creating visual containers and logical groupings in architecture diagrams.
They provide colored backgrounds/borders to organize related components.

Available Group Icons by Provider:
• AWS (11): aws_account, aws_auto_scaling_group, aws_cloud, aws_corporate_datacenter, aws_ec2_instance_contents...
• GCP (21): gcp_user_default, gcp_system, gcp_infrastructure_system, gcp_external_saas_providers, gcp_external_data_sources...
• Azure (19): azure_subscription_filled, azure_subscription_border, azure_resource_group_filled, azure_resource_group_border, azure_virtual_network_filled...

Usage in group_nodes function:
group_nodes(nodeIds, parentId, groupId, style, groupIconName)

Examples:
- aws_vpc: Purple border for AWS VPC grouping
- gcp_kubernetes_cluster: Pink background for GCP K8s clusters  
- azure_subscription_filled: Light blue filled background for Azure subscriptions
- gcp_system: Neutral light gray for general system grouping

Group Icon Properties:
- AWS: All have fill=false (border only styling)
- GCP: Most have fill=true (filled backgrounds), except optional_component_dashed
- Azure: Both filled and border variants available

Choose group icons based on:
1. Cloud provider alignment (aws_, gcp_, azure_)
2. Logical grouping type (vpc, subnet, cluster, etc.)
3. Visual hierarchy (filled vs border)
4. Color coordination with architecture
`;

// Complete tools definition for o4-mini reasoning model
const allTools = [
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
  }
];

export default async function handler(req) {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    console.log('=== STREAM REQUEST ===');
    console.log('Method:', req.method);
    
    // Get payload from request
    let payload;
    if (req.method === "POST") {
      const body = await req.json();
      payload = body?.payload;
    } else {
      const url = new URL(req.url);
      payload = url.searchParams.get('payload');
    }

    if (!payload) {
      return new Response(JSON.stringify({ error: "missing payload" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create a new ReadableStream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (obj) => {
          const data = `data: ${JSON.stringify(obj)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        try {
          // Parse initial conversation
          const conversation = JSON.parse(payload);
          await runConversationLoop(conversation, send, controller);
        } catch (error) {
          console.error('=== STREAMING ERROR ===');
          console.error('Error type:', error.constructor.name);
          console.error('Error message:', error.message);
          
          send({ 
            type: "error", 
            error: error.message,
            debug: {
              type: error.constructor.name,
              stack: error.stack
            }
          });
          
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }
    });

    // Return the stream response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('=== REQUEST ERROR ===');
    console.error('Error:', error);
    
    return new Response(JSON.stringify({ 
      type: "error", 
      error: error.message,
      debug: {
        type: error.constructor.name,
        stack: error.stack
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function runConversationLoop(conversation, send, controller) {
  const encoder = new TextEncoder();
  let elkGraph = { id: "root", children: [], edges: [] };
  
  while (true) {
    console.log(`🔄 Starting conversation turn with ${conversation.length} items`);
    console.log('🐛 DEBUG: About to call OpenAI API...');
    
    // Track which function calls we've already handled in this turn
    const handledCallIds = new Set();
    
    try {
      console.log('🐛 DEBUG: Creating OpenAI stream with client...');
      let retryCount = 0;
      let stream;
      
      while (retryCount < 3) {
        try {
          stream = await client.responses.create({
            model: "o4-mini",
            input: conversation,
            tools: allTools.map(tool => ({
              type: "function",
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              strict: false
            })),
            tool_choice: "auto",
            parallel_tool_calls: false,
            reasoning: { effort: "low", summary: "detailed" },
            stream: true
          });
          break; // If successful, exit retry loop
        } catch (streamError) {
          retryCount++;
          console.error(`❌ Stream creation failed (attempt ${retryCount}/3):`, streamError);
          if (retryCount === 3) {
            throw streamError; // Re-throw after all retries exhausted
          }
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }
      
      console.log('🐛 DEBUG: OpenAI stream created successfully');

      let messageCount = 0;
      for await (const delta of stream) {
        messageCount++;
        if (messageCount % 10 === 0) {
          console.log(`🐛 DEBUG: Processed ${messageCount} stream messages so far...`);
        }
        
        send(delta);

        // Debug: Log ALL delta types to see what we're actually receiving
        console.log("📨 Delta type:", delta.type);

        // Debug logs to see what the model is actually sending
        if (delta.type?.startsWith("function_call")) {
          console.log("🔔 delta function_call.* →", JSON.stringify(delta, null, 2));
        }
        if (delta.type === "response.reasoning_summary_text.delta") {
          console.log("🧠 reasoning →", delta.delta);
        }
        if (delta.type === "response.completed") {
          console.log("🏁 completed – output:", JSON.stringify(delta.response?.output, null, 2));
        }

        /* ─── execute as soon as the call is complete ─── */
        if (delta.type === "response.output_item.done" && delta.item?.type === "function_call") {
          const fc = delta.item;
          
          if (!handledCallIds.has(fc.call_id)) {
            handledCallIds.add(fc.call_id);
            console.log("🔧 immediate exec →", fc.name, "(call_id:", fc.call_id + ")");

            // For now, just return the current graph state for all functions
            // The actual execution will happen on the client side
            let toolResult;
            try {
              toolResult = { graph: elkGraph };
              console.log(`✅ Function ${fc.name} executed successfully`);
            } catch (e) {
              console.error(`❌ Function ${fc.name} failed:`, e);
              toolResult = { error: e.message };
            }

            const fco = {
              type: "function_call_output",
              call_id: fc.call_id,
              output: JSON.stringify(toolResult)      // ← back to JSON string, API expects string
            };

            send(fco);                 // give result to the model *immediately*
            conversation.push(fco);    // keep it in history
            console.log(`📝 Added function output to conversation for call_id: ${fc.call_id}`);
          } else {
            console.log(`⚠️ Skipping already handled call_id: ${fc.call_id}`);
          }
        }

        /* ─── finished turn? decide to loop or exit ─── */
        if (delta.type === "response.completed") {
          const calls = delta.response?.output?.filter((x) => x.type === "function_call") ?? [];
          if (calls.length === 0) {
            console.log('✅ No function calls found, ending conversation');
            console.log(`🐛 DEBUG: Total stream messages processed: ${messageCount}`);
            send({ type: "done", data: "[DONE]" });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          
          console.log(`🔄 ${calls.length} function call(s) processed, continuing conversation loop`);
          console.log(`🐛 DEBUG: Total stream messages processed this turn: ${messageCount}`);
          
          // Only add persistent items to conversation
          const persistentItems = delta.response.output.filter((item) => 
            item.type === "message"
          );
          conversation.push(...persistentItems);
          break;
        }
      }
    } catch (apiError) {
      console.error('🐛 DEBUG: OpenAI API Error:', apiError.constructor.name);
      console.error('🐛 DEBUG: OpenAI API Error message:', apiError.message);
      
      // Check if it's a connection error
      const isConnectionError = 
        apiError.constructor.name === 'APIConnectionError' ||
        apiError.message.toLowerCase().includes('connection') ||
        apiError.message.toLowerCase().includes('network') ||
        apiError.message.toLowerCase().includes('timeout');
      
      send({ 
        type: "error", 
        error: `OpenAI API Error: ${apiError.message}`,
        debug: {
          type: apiError.constructor.name,
          stack: apiError.stack,
          isConnectionError,
          suggestion: isConnectionError ? 
            "This appears to be a temporary connection issue. Please try again in a few moments." :
            "An unexpected error occurred. Please check the console for details."
        }
      });
      
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
      return;
    }
  }
}

// Configure Edge runtime for better streaming support
export const config = {
  runtime: 'edge',
  regions: ['iad1'], // US East (N. Virginia) for lower latency
};
