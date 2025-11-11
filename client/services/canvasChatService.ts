import { addNode, addEdge, groupNodes, batchUpdate } from '../components/graph/mutations';
import { addFunctionCallingMessage, updateStreamingMessage } from '../utils/chatUtils';
import { architectureSearchService } from '../utils/architectureSearchService';

export interface GraphState {
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  nodes: any[];
  edges: any[];
  structure: any;
  summary: string;
}

export interface ChatServiceDependencies {
  selectedArchitectureId: string;
  setArchitectureOperationState: (id: string, isRunning: boolean) => void;
  rawGraph: any;
  handleGraphChange: (graph: any) => void;
  layoutError?: string;
}

export class CanvasChatService {
  constructor(private deps: ChatServiceDependencies) {}

  /**
   * Extracts complete graph state for the agent
   */
  extractCompleteGraphState = (graph: any): GraphState => {
    const collectAllNodes = (graph: any): any[] => {
      const nodes: any[] = [];
      
      const traverse = (node: any, parentId?: string) => {
        nodes.push({
          id: node.id,
          label: node.labels?.[0]?.text || node.id,
          type: node.children ? 'group' : 'node',
          parentId: parentId || 'root',
          iconName: node.data?.iconName || '',
          position: node.position || { x: 0, y: 0 }
        });
        
        if (node.children) {
          node.children.forEach((child: any) => traverse(child, node.id));
        }
      };
      
      if (graph.children) {
        graph.children.forEach((child: any) => traverse(child));
      }
      
      return nodes;
    };
    
    const allNodes = collectAllNodes(graph);
    const allEdges = graph.edges?.map((edge: any) => ({
      id: edge.id,
      source: edge.sources?.[0] || edge.source,
      target: edge.targets?.[0] || edge.target,
      label: edge.labels?.[0]?.text || ''
    })) || [];
    
    return {
      nodeCount: allNodes.length,
      edgeCount: allEdges.length,
      groupCount: allNodes.filter(n => n.type === 'group').length,
      nodes: allNodes,
      edges: allEdges,
      structure: graph,
      summary: `Current graph has ${allNodes.length} nodes (${allNodes.filter(n => n.type === 'group').length} groups) and ${allEdges.length} edges`
    };
  };

  /**
   * Searches for matching reference architecture
   */
  private async searchReferenceArchitecture(message: string): Promise<string> {
    try {
      console.log('🔍 Starting architecture search...');
      const searchInput = message.toLowerCase().trim();
      const availableArchs = architectureSearchService.getAvailableArchitectures();
      
      if (availableArchs.length === 0) {
        throw new Error('❌ FATAL: No architectures loaded in service! Pre-computed embeddings failed to load.');
      }
      
      console.log(`🔍 Searching for reference architecture: "${searchInput}"`);
      addFunctionCallingMessage(`🔍 Searching architecture database...`);
      const matchedArch = await architectureSearchService.findMatchingArchitecture(searchInput);
        
      if (matchedArch) {
        // Parse the architecture JSON to extract useful patterns for the agent
        let architectureGuidance = "";
        try {
          // The architecture field contains a JSON-like string that needs to be parsed
          const archStr = matchedArch.architecture;
          console.log(`🔍 Parsing reference architecture:`, archStr.substring(0, 200) + '...');
          
          // Extract key patterns from the architecture description and JSON structure
          architectureGuidance = `\n\n🏗️ REFERENCE ARCHITECTURE GUIDANCE:
Found matching pattern: "${matchedArch.subgroup}" from ${matchedArch.cloud.toUpperCase()}
Description: ${matchedArch.description.substring(0, 300)}...

SOURCE: ${matchedArch.source}

KEY ARCHITECTURAL PATTERNS TO FOLLOW:
- Use ${matchedArch.cloud}_* icons for cloud-specific services  
- Follow the layered architecture approach shown in the reference
- Include proper edge connections between all components
- Group related services into logical containers
- Consider observability, security, and data flow patterns shown

ACTUAL REFERENCE GRAPH STRUCTURE (use as inspiration for your design):
${archStr}

This reference provides proven patterns for ${matchedArch.group} applications.
Adapt these patterns to your specific requirements while maintaining the overall structure.`;
          
        } catch (error: any) {
          console.error('❌ FATAL: Could not parse reference architecture:', error);
          throw new Error(`Failed to parse reference architecture: ${error.message}`);
        }
        
        console.log(`🏗️ Found reference architecture: ${matchedArch.subgroup}`);
        console.log(`📋 Reference architecture content:`, matchedArch);
        console.log(`📝 Full reference text being sent:`, architectureGuidance);
        addFunctionCallingMessage(`🏗️ Found reference architecture: ${matchedArch.subgroup}`);
        addFunctionCallingMessage(`🔗 Reference URL: ${matchedArch.source}`);
        
        return architectureGuidance;
      } else {
        console.log('❌ No suitable architecture match found');
        addFunctionCallingMessage(`⚠️ No matching reference architecture found`);
        return "";
      }
    } catch (error: any) {
      console.error("❌ FATAL: Architecture search failed:", error);
      addFunctionCallingMessage(`❌ FATAL ERROR: ${error.message}`);
      throw error; // Re-throw to fail loudly
    }
  }

  /**
   * Executes a function call from the agent
   */
  private executeFunctionCall(functionCall: any, currentGraph: any): { graph: any; result: string; error?: string } {
    const { name, arguments: args } = functionCall;
    let executionResult = '';
    let error: string | undefined;

    try {
      switch (name) {
        case 'add_node':
          const nodeName = args.nodename || 'new_node';
          const parentId = args.parentId || 'root';
          const nodeData = args.data || {};
          currentGraph = addNode(nodeName, parentId, currentGraph, {
            label: nodeData.label || nodeName,
            icon: nodeData.icon || 'api'
          });
          executionResult = `Successfully created node: ${nodeName}`;
          break;
          
        case 'add_edge':
          currentGraph = addEdge(args.edgeId, args.sourceId, args.targetId, currentGraph, args.label);
          executionResult = `Successfully created edge: ${args.sourceId} → ${args.targetId}`;
          break;
          
        case 'group_nodes':
          currentGraph = groupNodes(args.nodeIds, args.parentId, args.groupId, currentGraph);
          executionResult = `Successfully grouped nodes: [${args.nodeIds.join(', ')}] → ${args.groupId}`;
          break;
          
        case 'batch_update':
          currentGraph = batchUpdate(args.operations, currentGraph);
          
          // Update global state for chat agent after graph modifications
          (window as any).currentGraph = currentGraph;
          
          executionResult = `Successfully executed batch update: ${args.operations.length} operations`;
          break;
          
        default:
          executionResult = `Error: Unknown function ${name}`;
          error = `Unknown function: ${name}`;
          console.error('❌ Unknown function call:', name);
      }
    } catch (err: any) {
      let errorMsg = `Error executing ${name}: ${err.message}`;
      
      // Special handling for duplicate node errors - provide specific guidance
      if (err.message.includes('duplicate node id')) {
        const nodeId = err.message.match(/duplicate node id '([^']+)'/)?.[1];
        const existingNodes = currentGraph.children?.map((child: any) => child.id).join(', ') || 'none';
        errorMsg = `DUPLICATE NODE ERROR: Node '${nodeId}' already exists. Do NOT create it again. Existing nodes: ${existingNodes}`;
      }
      
      executionResult = errorMsg;
      error = errorMsg;
      console.error(`❌ ${errorMsg}:`, err);
    }

    return { graph: currentGraph, result: executionResult, error };
  }

  /**
   * Handles chat submission and processes the conversation with the agent
   */
  handleChatSubmit = async (message: string): Promise<void> => {
    console.log('🚀 handleChatSubmit called with message:', message);
    
    // Fire processing start events for status indicators
    console.log('🔄 Firing userRequirementsStart event for processing indicators');
    window.dispatchEvent(new CustomEvent('userRequirementsStart'));
    
    this.deps.setArchitectureOperationState(this.deps.selectedArchitectureId, true);
    
    try {
      let conversationHistory: any[] = [];
      let currentGraph = JSON.parse(JSON.stringify(this.deps.rawGraph));
      
      // Update global state for chat agent
      (window as any).currentGraph = currentGraph;
      console.log('📊 Updated global currentGraph for chat agent:', currentGraph ? `${currentGraph.children?.length || 0} nodes` : 'none');
      
      let turnNumber = 1;
      let errorCount = 0;
      const MAX_ERRORS = 10; // Increased error tolerance
      let currentResponseId: string | null = null;
      
      console.log('🚀 Starting architecture generation (3-turn prompt guidance)...');
      
      // Search for matching reference architecture to guide the agent
      const referenceArchitecture = await this.searchReferenceArchitecture(message);
      
      // Make initial conversation call to get response_id
      console.log(`📞 Making initial agent call for conversation start`);
      console.log('📤 Request payload:', { 
        message: message.trim(), 
        conversationHistory,
        currentGraph: currentGraph,
        referenceArchitecture: referenceArchitecture
      });
      
      // DEBUG: Check if images should be included
      const storedImages = (window as any).selectedImages || [];
      console.log('📸 DEBUG: InteractiveCanvas - storedImages:', storedImages.length);
      
      const initialResponse = await fetch('/api/simple-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: message.trim(), 
          conversationHistory,
          currentGraph: currentGraph,
          referenceArchitecture: referenceArchitecture,
          images: storedImages // Add images to the request
        })
      });

      if (!initialResponse.ok) {
        const errorData = await initialResponse.json();
        throw new Error(`API error: ${errorData.error}`);
      }

      let result = await initialResponse.json();
      currentResponseId = result.responseId || `temp_${Date.now()}`;
      
      console.log('🔗 Got initial response ID:', currentResponseId);
      console.log('🔍 Full result object:', result);

      // Main conversation loop - continue until no more work
      while ((result.hasMoreWork !== false && result.functionCalls && result.functionCalls.length > 0) && turnNumber <= 15) {
        console.log(`📊 Processing turn ${result.turnNumber || turnNumber} with ${result.count || result.functionCalls?.length || 0} operations`);
        
        console.log(`📊 Turn ${result.turnNumber} response:`, {
          functionCalls: result.count,
          isLikelyFinal: result.isLikelyFinalTurn,
          continueMessage: result.continueMessage
        });

        if (result.success && result.functionCalls) {
          // Fire function call start event for status indicators
          console.log('🔧 Firing functionCallStart event for processing indicators');
          window.dispatchEvent(new CustomEvent('functionCallStart'));
          
          const turnMessageId = addFunctionCallingMessage(`🔄 Turn ${result.turnNumber} - Processing ${result.count} operations`);
          let batchErrors: string[] = [];
          let toolOutputs: any[] = [];
        
          for (const functionCall of result.functionCalls) {
            const { name, call_id } = functionCall;
            const messageId = addFunctionCallingMessage(`${name}(${JSON.stringify(functionCall.arguments, null, 2)})`);
            
            const execution = this.executeFunctionCall(functionCall, currentGraph);
            currentGraph = execution.graph;
            
            if (execution.error) {
              updateStreamingMessage(messageId, `❌ ${execution.result}`, true, name);
              batchErrors.push(execution.error);
              errorCount++;
            } else {
              updateStreamingMessage(messageId, `✅ ${execution.result}`, true, name);
            }

            // Prepare tool output for chaining - SEND COMPLETE GRAPH STATE
            const completeGraphState = this.extractCompleteGraphState(currentGraph);
            toolOutputs.push({
              type: 'function_call_output',
              call_id: call_id,
              output: JSON.stringify({
                success: !execution.error,
                operation: name,
                result: execution.result,
                graph: completeGraphState,
                instruction: !execution.error 
                  ? "Continue building the architecture by calling the next required function. The current graph state is provided above for your reference."
                  : "Fix the error and retry the operation. The current graph state is provided above for your reference."
              })
            });
          }
            
          updateStreamingMessage(turnMessageId, `✅ Turn ${result.turnNumber} completed (${result.count} operations)`, true, 'batch_update');
          
          // Update UI after each turn - This makes progress visible to user
          this.deps.handleGraphChange(currentGraph);
          console.log(`🔄 Updated UI with turn ${result.turnNumber} changes`);
          
          // Check for ELK layout errors from the hook
          if (this.deps.layoutError) {
            batchErrors.push(`ELK Layout Error: ${this.deps.layoutError}`);
            console.error('🔥 ELK Layout Error detected:', this.deps.layoutError);
          }
          
          // Include error feedback in tool outputs if there were errors
          if (batchErrors.length > 0 || this.deps.layoutError) {
            toolOutputs.forEach(output => {
              const outputData = JSON.parse(output.output);
              outputData.errors = batchErrors;
              if (this.deps.layoutError) outputData.layout_error = this.deps.layoutError;
              output.output = JSON.stringify(outputData);
            });
            errorCount += batchErrors.length;
            console.log(`🔥 Including ${batchErrors.length} errors in tool outputs`);
          }
          
          // Stop if too many errors
          if (errorCount >= MAX_ERRORS) {
            console.log(`🛑 Stopping multi-turn generation after ${errorCount} errors`);
            const errorStopMessage = addFunctionCallingMessage(`🛑 Stopping generation due to ${errorCount} errors. Please review the architecture and try again.`);
            updateStreamingMessage(errorStopMessage, `❌ Generation stopped due to repeated errors`, true, 'error');
            break;
          }
          
          // Send tool outputs back to continue conversation
          console.log('🔗 Sending tool outputs for continuation with response ID:', currentResponseId);
          const continuationResponse = await fetch('/api/simple-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolOutputs: toolOutputs,
              previousResponseId: currentResponseId,
              currentGraph: currentGraph  // Include updated graph state
            })
          });

          if (!continuationResponse.ok) {
            console.error('❌ Tool output continuation failed');
            break;
          }

          result = await continuationResponse.json();
          currentResponseId = result.responseId;
          turnNumber++;
          
        } else if (result.completed || result.hasMoreWork === false) {
          console.log('✅ Agent completed architecture generation naturally');
          const completionMessage = addFunctionCallingMessage(`🏁 Agent completed architecture generation`);
          updateStreamingMessage(completionMessage, `✅ Architecture generation completed - agent has no more work to do`, true, 'completion');
          
          // Fire completion events to update ProcessingStatusIcon and re-enable chatbox
          window.dispatchEvent(new CustomEvent('allProcessingComplete'));
          window.dispatchEvent(new CustomEvent('processingComplete'));
          
          // Re-enable chatbox for natural completion
          setTimeout(() => {
            this.deps.setArchitectureOperationState(this.deps.selectedArchitectureId, false);
          }, 1000);
          
          break;
        } else {
          console.error('❌ Unexpected response format - stopping');
          break;
        }
      }
      
      this.deps.handleGraphChange(currentGraph);
      console.log('✅ Architecture generation completed');
      
      // Fire completion events to update ProcessingStatusIcon and re-enable chatbox
      window.dispatchEvent(new CustomEvent('allProcessingComplete'));
      window.dispatchEvent(new CustomEvent('processingComplete'));
      
      setTimeout(() => {
        this.deps.setArchitectureOperationState(this.deps.selectedArchitectureId, false);
      }, 1000);
      
    } catch (error: any) {
      console.error('❌ MULTI-TURN AGENT error:', error);
      
      // Fire completion events to re-enable chatbox even on error
      window.dispatchEvent(new CustomEvent('allProcessingComplete'));
      window.dispatchEvent(new CustomEvent('processingComplete'));
      
      this.deps.setArchitectureOperationState(this.deps.selectedArchitectureId, false);
    }
  };
}
