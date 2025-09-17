import OpenAI from 'openai';
import { 
  elkGraphDescription, 
  agentInstruction, 
  modelConfigs, 
  timeoutConfigs 
} from './agentConfig.js';
import { 
  availableGroupIcons, 
  groupIconInstructions,
  availableIconsComprehensive
} from './generated/dynamicAgentResources.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    message, 
    conversationHistory = [], 
    currentGraph, 
    referenceArchitecture = "",
    toolOutputs = null,
    previousResponseId = null
  } = req.body;
  
  // Handle two modes: initial conversation start OR tool output continuation
  const isToolOutputContinuation = toolOutputs && previousResponseId;
  
  if (!isToolOutputContinuation && !message) {
    return res.status(400).json({ error: 'Message required for new conversation' });
  }

  console.log('🤖 AGENT: Mode:', isToolOutputContinuation ? 'TOOL_OUTPUT_CONTINUATION' : 'NEW_CONVERSATION');
  if (!isToolOutputContinuation) {
    console.log('🤖 AGENT: Received user message:', message);
    console.log('🔄 AGENT: Conversation history length:', conversationHistory.length);
    console.log('📊 AGENT: Current graph state:', currentGraph ? `${currentGraph.children?.length || 0} nodes` : 'empty');
    console.log('🏗️ AGENT: Reference architecture received:', referenceArchitecture ? referenceArchitecture.substring(0, 200) + '...' : 'NONE');
  } else {
    console.log('🔧 AGENT: Tool output continuation with response ID:', previousResponseId);
    console.log('🔧 AGENT: Tool outputs count:', toolOutputs?.length || 0);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutConfigs.requestTimeout,
  });

  try {
    // Helper function to get all node IDs recursively
    const getAllNodeIds = (node: any): string[] => {
      const ids = [node.id];
      if (node.children) {
        node.children.forEach((child: any) => {
          ids.push(...getAllNodeIds(child));
        });
      }
      return ids;
    };

    // Build current graph state description
    const graphStateDescription = currentGraph ? `
CURRENT GRAPH STATE (DO NOT DUPLICATE THESE):
${currentGraph.children?.length ? 
  `EXISTING NODES: ${getAllNodeIds(currentGraph).filter(id => id !== 'root').join(', ')}
EXISTING EDGES: ${currentGraph.edges?.length ? currentGraph.edges.map((edge: any) => `${edge.source} → ${edge.target}`).join(', ') : 'none'}

⚠️ CRITICAL: Do NOT create nodes that already exist! Use existing node IDs when creating edges.
📊 Graph Summary: ${currentGraph.children.length} top-level nodes, ${currentGraph.edges?.length || 0} edges` 
  : 'EXISTING NODES: none, EXISTING EDGES: none'
}` : 'CURRENT GRAPH STATE: Empty (starting fresh)';

    // Build conversation input with history - using original system prompt format
    const baseMessages = [
      {
        role: 'system',
        content: `${elkGraphDescription.replace(
          '${availableIconsComprehensive.length}', 
          availableIconsComprehensive.length.toString()
        ).replace(
          '${availableIconsComprehensive.join(\', \')}', 
          availableIconsComprehensive.join(', ')
        ).replace(
          '${groupIconInstructions}', 
          groupIconInstructions
        ).replace(
          '${availableGroupIcons.join(\', \')}', 
          availableGroupIcons.join(', ')
        )}

${graphStateDescription}

🚨 CRITICAL CONSTRAINT: Complete the architecture in NO MORE THAN 3 TURNS maximum. 
Current turn: ${conversationHistory.length + 1}/3
${conversationHistory.length >= 2 ? '⚠️ FINAL TURN - Complete the architecture now!' : ''}

${referenceArchitecture}`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ];

    let conversationInput: any[];

    if (isToolOutputContinuation) {
      // Tool output continuation mode - send tool outputs with previous response ID
      console.log('🔧 AGENT: Preparing tool output continuation...');
      conversationInput = toolOutputs;
    } else {
      // Initial conversation mode - simple message format like previous system
      conversationInput = baseMessages;
    }

    // OpenAI Responses API call with multi-turn support
    console.log('🧠 AGENT: Calling OpenAI Responses API for turn', conversationHistory.length + 1);
    if (!isToolOutputContinuation) {
      console.log('📝 AGENT: System prompt preview:', conversationInput[0].content.substring(0, 500) + '...');
    }
    // Build the API request
    const apiRequest: any = {
      model: modelConfigs.reasoning.model,
      input: conversationInput,
      tools: [
        {
          type: 'function',
          name: 'batch_update',
          description: 'Executes a series of graph operations in order. CRITICAL: You must pass { operations: [...] } structure. NEVER pass a graph object with id/children/edges.\n\nEXACT FORMAT EXAMPLES:\n\nADD_NODE: { "name": "add_node", "nodename": "api_gateway", "parentId": "root", "data": { "label": "API Gateway", "icon": "gateway" } }\n\nADD_EDGE: { "name": "add_edge", "edgeId": "e1", "sourceId": "api_gateway", "targetId": "database", "label": "queries" }\n\nGROUP_NODES: { "name": "group_nodes", "nodeIds": ["api_gateway", "database"], "parentId": "root", "groupId": "backend", "groupIconName": "gcp_system" }\n\n❌ WRONG: "type", "id", "properties", "source", "target", "from", "to"\n✅ CORRECT: "nodename", "parentId", "data", "sourceId", "targetId", "edgeId"',
          strict: false,
          parameters: {
            type: 'object',
            properties: {
              operations: {
                type: 'array',
                description: 'REQUIRED: Array of operations to execute. Each operation must have "name" field. Do NOT pass a graph object here!',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Name of the operation to perform (add_node, delete_node, move_node, add_edge, delete_edge, group_nodes, remove_group)',
                      enum: ['add_node', 'delete_node', 'move_node', 'add_edge', 'delete_edge', 'group_nodes', 'remove_group']
                    },
                    nodename: {
                      type: 'string',
                      description: 'For add_node: Name/ID of the new node to add'
                    },
                    parentId: {
                      type: 'string',
                      description: 'For add_node or group_nodes: ID of the parent node where this node will be added'
                    },
                    nodeId: {
                      type: 'string',
                      description: 'For delete_node or move_node: ID of the node to operate on'
                    },
                    newParentId: {
                      type: 'string',
                      description: 'For move_node: ID of the new parent node'
                    },
                    edgeId: {
                      type: 'string',
                      description: 'For add_edge or delete_edge: ID of the edge'
                    },
                    sourceId: {
                      type: 'string',
                      description: 'For add_edge: ID of the source node'
                    },
                    targetId: {
                      type: 'string',
                      description: 'For add_edge: ID of the target node'
                    },
                    nodeIds: {
                      type: 'array',
                      items: {
                        type: 'string'
                      },
                      description: 'For group_nodes: IDs of the nodes to group'
                    },
                    groupId: {
                      type: 'string',
                      description: 'For group_nodes or remove_group: ID of the group'
                    },
                    groupIconName: {
                      type: 'string',
                      description: 'For group_nodes: Group icon name for the group'
                    },
                    data: {
                      type: 'object',
                      description: 'For add_node: Additional node data including icon and label'
                    },
                    label: {
                      type: 'string',
                      description: 'For add_edge: Optional edge label'
                    }
                  },
                  required: ['name']
                }
              }
            },
            required: ['operations']
          }
        }
      ],
      tool_choice: modelConfigs.reasoning.tool_choice,
      parallel_tool_calls: modelConfigs.reasoning.parallel_tool_calls
    };

    // Add previous_response_id for tool output continuation
    if (isToolOutputContinuation && previousResponseId) {
      apiRequest.previous_response_id = previousResponseId;
      console.log('🔗 AGENT: Using previous_response_id for chaining:', previousResponseId);
    }

    const response = await openai.responses.create(apiRequest);

    console.log('✅ AGENT: OpenAI response received');
    console.log('🔍 AGENT: Full response:', JSON.stringify(response, null, 2));
    
    // Try different ways to get the response ID
    console.log('🔍 AGENT: response.id:', response.id);
    console.log('🔍 AGENT: response.response_id:', (response as any).response_id);
    console.log('🔍 AGENT: response.conversation_id:', (response as any).conversation_id);
    const responseId = response.id || (response as any).response_id || (response as any).conversation_id || `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔍 AGENT: Final extracted response ID:', responseId);
    console.log('🔍 AGENT: responseId type:', typeof responseId);
    
    // Extract function calls from Responses API
    const functionCalls = response.output?.filter(item => item.type === 'function_call') || [];
    
    console.log(`🔧 AGENT: Found ${functionCalls.length} function calls to execute`);
    
    if (functionCalls.length === 0) {
      // Natural completion - agent has no more work to do
      console.log('✅ AGENT: Natural completion - no more function calls needed');
      return res.status(200).json({ 
        success: true,
        functionCalls: [],
        count: 0,
        turnNumber: conversationHistory.length + 1,
        isLikelyFinalTurn: true,
        continueMessage: null,
        responseId: responseId,
        hasMoreWork: false,
        completed: true
      });
    }

    // Return ALL function calls for frontend to execute (Responses API format)
    const parsedCalls = functionCalls.map((call, index) => {
      console.log(`🔍 AGENT: Raw call ${index + 1} - name: "${call.name}"`);
      console.log(`🔍 AGENT: Raw arguments: "${call.arguments}"`);
      
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(call.arguments);
      } catch (parseError) {
        console.error(`❌ AGENT: JSON parse error for call ${index + 1}:`, parseError);
        console.error(`❌ AGENT: Invalid JSON: "${call.arguments}"`);
        throw new Error(`Invalid JSON in function call arguments: ${call.arguments}`);
      }
      
      const parsed = {
        name: call.name,
        arguments: parsedArgs,
        call_id: call.call_id
      };
      console.log(`📞 AGENT: Tool ${index + 1}/${functionCalls.length} - ${call.name}:`, parsed.arguments);
      
      // Debug: Log operation parameter names
      if (parsed.arguments.operations && parsed.arguments.operations[0]) {
        console.log(`🧪 AGENT: First operation parameter keys:`, Object.keys(parsed.arguments.operations[0]));
        console.log(`🧪 AGENT: First operation sample:`, parsed.arguments.operations[0]);
      }
      
      return parsed;
    });

    // Determine if this might be the final turn (architecture completion heuristic)
    const currentTurn = conversationHistory.length + 1;
    const isLikelyFinalTurn = false; // Never suggest final until agent explicitly decides architecture is complete
    
    console.log('🚀 AGENT: Sending tool calls to frontend for execution');
    console.log(`📊 AGENT: Current turn: ${currentTurn}, Likely final: ${isLikelyFinalTurn}`);
    
    console.log('🔍 AGENT: parsedCalls length:', parsedCalls.length);
    console.log('🔍 AGENT: parsedCalls type:', typeof parsedCalls);
    console.log('🔍 AGENT: parsedCalls array?:', Array.isArray(parsedCalls));
    
    const hasMoreWork = parsedCalls.length > 0;
    console.log('🔍 AGENT: hasMoreWork calculation:', parsedCalls.length, '> 0 =', hasMoreWork);
    
    const responsePayload = {
      success: true,
      functionCalls: parsedCalls,
      count: parsedCalls.length,
      turnNumber: currentTurn,
      isLikelyFinalTurn,
      continueMessage: isLikelyFinalTurn ? null : `Continue with turn ${currentTurn + 1}`,
      responseId: responseId, // Include response ID for chaining
      hasMoreWork: hasMoreWork // Frontend can use this to continue
    };
    
    console.log('🔍 AGENT: Final response payload:', JSON.stringify(responsePayload, null, 2));
    
    res.status(200).json(responsePayload);

  } catch (error) {
    console.error('❌ AGENT ERROR: OpenAI request failed:', error);
    res.status(500).json({ 
      error: 'OpenAI request failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
