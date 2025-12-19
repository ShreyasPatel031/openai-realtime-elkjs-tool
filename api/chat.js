import OpenAI from 'openai';
import { writeFile, appendFile } from 'fs/promises';
import { join } from 'path';

const DEBUG_LOG_PATH = join(process.cwd(), '.cursor', 'debug.log');

export default async function handler(req, res) {
  // #region agent log
  const logEntry = JSON.stringify({location:'api/chat.js:4',message:'Backend: Handler entry',data:{method:req.method,url:req.url,hasBody:!!req.body,bodyType:typeof req.body,contentType:req.headers['content-type']},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n';
  appendFile(DEBUG_LOG_PATH, logEntry).catch(()=>{});
  // #endregion
  console.log('🚀 Chat API called:', req.method, req.url);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('📡 Handling CORS preflight');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('🔑 Checking API key...');
    // Check for API key
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your-openai-api-key-here') {
      console.log('❌ API key not configured');
      res.status(500).json({ 
        error: 'OpenAI API key not configured',
        message: 'Please set your OpenAI API key in the .env file'
      });
      return;
    }

    console.log('✅ API key found');
    // #region agent log
    const logEntry2 = JSON.stringify({location:'api/chat.js:42',message:'Backend: Before body validation',data:{bodyExists:!!req.body,bodyType:typeof req.body,bodyIsObject:typeof req.body==='object'&&req.body!==null,bodyKeys:req.body?Object.keys(req.body):null,bodyStringPreview:req.body?JSON.stringify(req.body).substring(0,200):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n';
    appendFile(DEBUG_LOG_PATH, logEntry2).catch(()=>{});
    // #endregion
    console.log('📥 FULL REQUEST BODY RECEIVED:');
    console.log('  - req.body exists?', !!req.body);
    console.log('  - req.body type:', typeof req.body);
    console.log('  - req.body is object?', typeof req.body === 'object' && req.body !== null);
    console.log('  - Body keys:', req.body ? Object.keys(req.body) : 'req.body is null/undefined');
    console.log('  - Full req.body (raw):', req.body);
    console.log('  - Full req.body (stringified, first 5000 chars):', req.body ? JSON.stringify(req.body).substring(0, 5000) : 'req.body is null/undefined');
    console.log('  - Messages:', req.body.messages ? `${req.body.messages.length} messages` : 'missing');
    console.log('  - Current graph:', req.body.currentGraph ? `${req.body.currentGraph.children?.length || 0} nodes` : 'missing/null');
    console.log('  - Images:', req.body.images ? `${req.body.images.length} images` : 'missing');
    console.log('  - Selected node IDs (raw):', req.body.selectedNodeIds);
    console.log('  - Selected node IDs (stringified):', JSON.stringify(req.body.selectedNodeIds));
    console.log('  - Selected node IDs type:', typeof req.body.selectedNodeIds, Array.isArray(req.body.selectedNodeIds) ? 'is array' : 'NOT array');
    console.log('  - Selected node IDs length:', req.body.selectedNodeIds?.length || 0);
    console.log('  - Selected edge IDs (raw):', req.body.selectedEdgeIds);
    console.log('  - Selected edge IDs (stringified):', JSON.stringify(req.body.selectedEdgeIds));
    console.log('  - Selected edge IDs type:', typeof req.body.selectedEdgeIds, Array.isArray(req.body.selectedEdgeIds) ? 'is array' : 'NOT array');
    console.log('  - Selected edge IDs length:', req.body.selectedEdgeIds?.length || 0);
    console.log('  - Full body (stringified, first 2000 chars):', JSON.stringify(req.body).substring(0, 2000));
    
    // Safely destructure with null check
    if (!req.body || typeof req.body !== 'object') {
      console.log('❌ Invalid request body:', typeof req.body);
      console.log('   req.body:', req.body);
      res.status(400).json({ error: 'Request body is required and must be an object', received: typeof req.body });
      return;
    }
    
    // Extract with safe defaults
    const messages = req.body.messages;
    const currentGraph = req.body.currentGraph || { id: "root", children: [], edges: [] };
    const images = Array.isArray(req.body.images) ? req.body.images : [];
    const selectedNodeIds = Array.isArray(req.body.selectedNodeIds) ? req.body.selectedNodeIds : [];
    const selectedEdgeIds = Array.isArray(req.body.selectedEdgeIds) ? req.body.selectedEdgeIds : [];
    console.log('📨 Received messages:', messages);
    console.log('📊 Received current graph:', currentGraph ? `${currentGraph.children?.length || 0} nodes` : 'none');
    console.log('📸 Received images:', images ? `${images.length} images` : 'none');
    console.log('🎯 Selected nodes:', selectedNodeIds);
    console.log('🎯 Selected edges:', selectedEdgeIds);

    if (!messages || !Array.isArray(messages)) {
      // #region agent log
      const logEntry3 = JSON.stringify({location:'api/chat.js:75',message:'Backend: 400 error - Invalid messages',data:{messagesValue:messages,messagesType:typeof messages,isArray:Array.isArray(messages),bodyKeys:req.body?Object.keys(req.body):null,bodyString:req.body?JSON.stringify(req.body).substring(0,500):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})+'\n';
      appendFile(DEBUG_LOG_PATH, logEntry3).catch(()=>{});
      // #endregion
      console.log('❌ Invalid messages format');
      console.log('   messages value:', messages);
      console.log('   messages type:', typeof messages);
      console.log('   messages is array?', Array.isArray(messages));
      res.status(400).json({ error: 'Messages array is required', details: { received: typeof messages, isArray: Array.isArray(messages) } });
      return;
    }

    console.log('🤖 Initializing OpenAI client');
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Helper function to get all node IDs recursively
    const getAllNodeIds = (node) => {
      const ids = [node.id];
      if (node.children) {
        node.children.forEach((child) => {
          ids.push(...getAllNodeIds(child));
        });
      }
      return ids;
    };

    // Helper function to find a node by ID in the graph
    const findNodeById = (graph, nodeId) => {
      if (!graph || !nodeId) return null;
      
      // Check root
      if (graph.id === nodeId) return graph;
      
      // Recursively search children
      const searchInChildren = (nodes) => {
        for (const node of nodes || []) {
          if (node.id === nodeId) return node;
          if (node.children) {
            const found = searchInChildren(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      return searchInChildren(graph.children);
    };

    // Build detailed selection context
    let selectionContext = '';
    if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
      const selectedItems = [];
      
      // Process selected nodes/groups
      if (selectedNodeIds.length > 0 && currentGraph) {
        selectedNodeIds.forEach(nodeId => {
          const node = findNodeById(currentGraph, nodeId);
          console.log(`🔍 Looking for node with ID: ${nodeId}`);
          console.log(`🔍 Node found?`, !!node);
          if (node) {
            console.log(`🔍 Node structure:`, {
              id: node.id,
              hasChildren: !!(node.children && node.children.length > 0),
              childrenCount: node.children?.length || 0,
              hasData: !!node.data,
              hasLabel: !!(node.data?.label || node.label || (node.labels && node.labels.length > 0)),
              data: node.data,
              labels: node.labels
            });
            const isGroup = node.children && node.children.length > 0;
            const nodeType = isGroup ? 'GROUP' : 'NODE';
            // Try multiple ways to get the label
            const label = node.data?.label || 
                         (node.labels && node.labels.length > 0 && node.labels[0]?.text) ||
                         node.label || 
                         nodeId;
            const icon = node.data?.icon || node.data?.groupIcon || node.icon || 'none';
            
            let itemDesc = `- ${nodeType}: "${label}" (ID: ${nodeId}, Icon: ${icon})`;
            
            // If it's a group, list its children
            if (isGroup && node.children) {
              const childLabels = node.children
                .map(child => {
                  // Try multiple ways to get label
                  return child.data?.label || 
                         (child.labels && child.labels.length > 0 && child.labels[0]?.text) ||
                         child.label || 
                         child.id;
                })
                .filter(Boolean)
                .join(', ');
              itemDesc += `\n  Contains: ${node.children.length} item(s) - ${childLabels || 'unnamed items'}`;
            }
            
            selectedItems.push(itemDesc);
          } else {
            // Node not found, just show the ID
            selectedItems.push(`- UNKNOWN: ${nodeId} (node not found in current graph)`);
          }
        });
      }
      
      // Process selected edges
      if (selectedEdgeIds.length > 0 && currentGraph) {
        const edges = currentGraph.edges || [];
        selectedEdgeIds.forEach(edgeId => {
          const edge = edges.find(e => e.id === edgeId);
          if (edge) {
            // Handle both formats: edge.source/target (single) or edge.sources/targets (arrays)
            const sourceId = edge.source || (edge.sources && edge.sources.length > 0 ? edge.sources[0] : null);
            const targetId = edge.target || (edge.targets && edge.targets.length > 0 ? edge.targets[0] : null);
            const sourceNode = sourceId ? findNodeById(currentGraph, sourceId) : null;
            const targetNode = targetId ? findNodeById(currentGraph, targetId) : null;
            // Try multiple ways to get labels
            const sourceLabel = sourceNode ? (
              sourceNode.data?.label || 
              (sourceNode.labels && sourceNode.labels.length > 0 && sourceNode.labels[0]?.text) ||
              sourceNode.label || 
              sourceId
            ) : sourceId || 'unknown';
            const targetLabel = targetNode ? (
              targetNode.data?.label || 
              (targetNode.labels && targetNode.labels.length > 0 && targetNode.labels[0]?.text) ||
              targetNode.label || 
              targetId
            ) : targetId || 'unknown';
            const edgeLabel = (edge.labels && edge.labels.length > 0 && edge.labels[0]?.text) ||
                             edge.label || 
                             edge.data?.label || 
                             'unnamed';
            selectedItems.push(`- EDGE: "${edgeLabel}" from "${sourceLabel}" → "${targetLabel}" (ID: ${edgeId})`);
          } else {
            selectedItems.push(`- EDGE: ${edgeId} (edge not found in current graph)`);
          }
        });
      }
      
      selectionContext = `
USER SELECTION CONTEXT:
The user has currently selected the following ${selectedItems.length} element(s):

${selectedItems.join('\n')}

IMPORTANT: When the user asks questions like "what is selected?", "what am I selecting?", "what group is selected?", etc., you should describe what they have selected using the information above. Be specific about the labels, types (group vs node), and what's inside groups.

When the user asks to modify or edit something, they are likely referring to these selected elements.`;
      
      console.log('📋 Selection context built:', selectionContext);
    } else {
      console.log('⚠️ No selection context - selectedNodeIds and selectedEdgeIds are empty');
    }

    // Build current graph state description
    const graphStateDescription = currentGraph ? `
CURRENT ARCHITECTURE STATE:
${currentGraph.children?.length ? 
  `EXISTING NODES: ${getAllNodeIds(currentGraph).filter(id => id !== 'root').join(', ')}
EXISTING EDGES: ${currentGraph.edges?.length ? currentGraph.edges.map((edge) => `${edge.source} → ${edge.target}`).join(', ') : 'none'}

📊 Architecture Summary: ${currentGraph.children.length} top-level nodes, ${currentGraph.edges?.length || 0} edges

FULL GRAPH JSON:
${JSON.stringify(currentGraph, null, 2)}` 
  : 'EXISTING NODES: none, EXISTING EDGES: none'
}` : 'CURRENT ARCHITECTURE STATE: Empty (no architecture created yet)';

    console.log('📡 Setting up streaming response');
    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('🔄 Creating chat completion...');
    
    // Process messages to include images if provided
    const processedMessages = messages.map(msg => {
      // Check if this message has images (either from the message itself or from the global images array)
      const messageImages = msg.images || (msg.role === 'user' && images ? images : []);
      
    console.log('🔍 Processing message:', msg.role, 'has images:', !!msg.images, 'global images:', images?.length || 0);
    console.log('🔍 MessageImages:', messageImages?.length || 0);
      
      if (messageImages && messageImages.length > 0) {
        // Convert images to OpenAI format
        const imageContent = messageImages.map(imageDataUrl => ({
          type: "image_url",
          image_url: {
            url: imageDataUrl
          }
        }));
        
        console.log('📸 Created image content for message:', imageContent.length, 'images');
        
        return {
          role: msg.role,
          content: [
            { type: "text", text: msg.content },
            ...imageContent
          ]
        };
      }
      return msg;
    });
    
    // Use gpt-4.1 which supports images
    const modelToUse = 'gpt-4.1';
    console.log('🤖 Using model:', modelToUse);
    
    // ============================================================================
    // CONTEXT-RICH DATA EXTRACTION (No regex, no hardcoded patterns)
    // ============================================================================
    
    // Helper: Extract all labels from graph (pure data extraction)
    const extractAllLabels = (graph) => {
      if (!graph || !graph.children) return [];
      const labels = [];
      const extract = (node) => {
        const label = node.data?.label || 
                      (node.labels && node.labels.length > 0 && node.labels[0]?.text) ||
                      node.label || 
                      node.id;
        labels.push(label);
        if (node.children) {
          node.children.forEach(extract);
        }
      };
      graph.children.forEach(extract);
      return labels;
    };
    
    const extractAllGroupLabels = (graph) => {
      if (!graph || !graph.children) return [];
      const groupLabels = [];
      graph.children.forEach(node => {
        if (node.children && node.children.length > 0) {
          const label = node.data?.label || 
                        (node.labels && node.labels.length > 0 && node.labels[0]?.text) ||
                        node.label || 
                        node.id;
          groupLabels.push(label);
        }
      });
      return groupLabels;
    };
    
    const extractAllEdgeLabels = (graph) => {
      if (!graph || !graph.edges) return [];
      return graph.edges.map(edge => 
        (edge.labels && edge.labels.length > 0 && edge.labels[0]?.text) ||
        edge.label ||
        edge.data?.label ||
        edge.id
      );
    };
    
    // Helper: Get selected group IDs
    const getSelectedGroupIds = (graph, selectedNodeIds) => {
      if (!graph || !selectedNodeIds || selectedNodeIds.length === 0) return [];
      const groupIds = [];
      selectedNodeIds.forEach(nodeId => {
        const node = findNodeById(graph, nodeId);
        if (node && node.children && node.children.length > 0) {
          groupIds.push(nodeId);
        }
      });
      return groupIds;
    };
    
    // Helper: Get selected group details
    const getSelectedGroupDetails = (graph, selectedNodeIds) => {
      if (!graph || !selectedNodeIds || selectedNodeIds.length === 0) return [];
      const groupDetails = [];
      selectedNodeIds.forEach(nodeId => {
        const node = findNodeById(graph, nodeId);
        if (node && node.children && node.children.length > 0) {
          const label = node.data?.label || 
                        (node.labels && node.labels.length > 0 && node.labels[0]?.text) ||
                        node.label || 
                        nodeId;
          groupDetails.push({
            id: nodeId,
            label: label,
            isGroup: true,
            childrenCount: node.children.length,
            childrenLabels: node.children.map(child => 
              child.data?.label || 
              (child.labels && child.labels.length > 0 && child.labels[0]?.text) ||
              child.label ||
              child.id
            )
          });
        }
      });
      return groupDetails;
    };
    
    // Helper: Get selected node details
    const getSelectedNodeDetails = (graph, selectedNodeIds) => {
      if (!graph || !selectedNodeIds || selectedNodeIds.length === 0) return [];
      return selectedNodeIds.map(nodeId => {
        const node = findNodeById(graph, nodeId);
        if (!node) return { id: nodeId, found: false };
        return {
          id: nodeId,
          found: true,
          label: node.data?.label || 
                 (node.labels && node.labels.length > 0 && node.labels[0]?.text) ||
                 node.label || 
                 nodeId,
          isGroup: !!(node.children && node.children.length > 0),
          childrenCount: node.children?.length || 0,
          childrenLabels: node.children?.map(child => 
            child.data?.label || 
            (child.labels && child.labels.length > 0 && child.labels[0]?.text) ||
            child.label ||
            child.id
          ) || []
        };
      });
    };
    
    // Helper: Get selected edge details
    const getSelectedEdgeDetails = (graph, selectedEdgeIds) => {
      if (!graph || !selectedEdgeIds || selectedEdgeIds.length === 0) return [];
      return selectedEdgeIds.map(edgeId => {
        const edge = graph.edges?.find(e => e.id === edgeId);
        if (!edge) return { id: edgeId, found: false };
        const sourceId = edge.source || (edge.sources && edge.sources[0]);
        const targetId = edge.target || (edge.targets && edge.targets[0]);
        const sourceNode = sourceId ? findNodeById(graph, sourceId) : null;
        const targetNode = targetId ? findNodeById(graph, targetId) : null;
        return {
          id: edgeId,
          found: true,
          label: (edge.labels && edge.labels.length > 0 && edge.labels[0]?.text) ||
                 edge.label ||
                 edge.data?.label ||
                 edgeId,
          sourceId: sourceId,
          sourceLabel: sourceNode ? (
            sourceNode.data?.label ||
            (sourceNode.labels && sourceNode.labels.length > 0 && sourceNode.labels[0]?.text) ||
            sourceNode.label ||
            sourceId
          ) : sourceId,
          targetId: targetId,
          targetLabel: targetNode ? (
            targetNode.data?.label ||
            (targetNode.labels && targetNode.labels.length > 0 && targetNode.labels[0]?.text) ||
            targetNode.label ||
            targetId
          ) : targetId
        };
      });
    };
    
    // Helper: Properly track questions and answers by ID
    const getQuestionAnswerTracking = (messages) => {
      const questionsAsked = new Map(); // questionId -> { questionId, content, timestamp, index }
      const answersGiven = new Set(); // questionId (which questions have been answered)
      
      messages.forEach((msg, index) => {
        // Track all question messages (by type or by content pattern)
        const isQuestion = msg.type === 'question' || 
                          msg.type === 'radio-question' || 
                          msg.type === 'checkbox-question' ||
                          (msg.role === 'assistant' && (
                            msg.content?.includes('Question') ||
                            msg.content?.includes('?') ||
                            msg.content?.includes('What is') ||
                            msg.content?.includes('Where will') ||
                            msg.content?.includes('Which') ||
                            msg.content?.includes('How')
                          ));
        
        if (isQuestion && msg.role === 'assistant') {
          // Use message ID as question ID, or generate one if missing
          const questionId = msg.id || `question-${index}-${Date.now()}`;
          questionsAsked.set(questionId, {
            questionId,
            content: msg.content,
            timestamp: msg.timestamp || new Date(),
            index,
            type: msg.type
          });
        }
        
        // Track answers - answers reference their question ID
        if (msg.role === 'user' && msg.content?.toLowerCase().startsWith('selected:')) {
          // Try to find the question this answer belongs to by looking backwards
          for (let i = index - 1; i >= 0; i--) {
            const prevMsg = messages[i];
            if (prevMsg.role === 'assistant') {
              const isPrevQuestion = prevMsg.type === 'question' || 
                                    prevMsg.type === 'radio-question' || 
                                    prevMsg.type === 'checkbox-question' ||
                                    (prevMsg.content?.includes('?') ||
                                     prevMsg.content?.includes('What is') ||
                                     prevMsg.content?.includes('Where will') ||
                                     prevMsg.content?.includes('Which') ||
                                     prevMsg.content?.includes('How'));
              
              if (isPrevQuestion) {
                const questionId = prevMsg.id || `question-${i}-${Date.now()}`;
                answersGiven.add(questionId);
                break; // Only mark the immediately preceding question as answered
              }
            }
          }
        }
      });
      
      return { questionsAsked, answersGiven };
    };
    
    // Helper: Check if there's an unanswered question (proper tracking by ID)
    const hasUnansweredQuestion = (messages) => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:449',message:'hasUnansweredQuestion: entry',data:{messagesCount:messages.length,allMessages:messages.map(m=>({role:m.role,type:m.type,content:m.content?.substring(0,80),id:m.id}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const { questionsAsked, answersGiven } = getQuestionAnswerTracking(messages);
      
      // Check if ANY question is unanswered
      let unansweredQuestions = [];
      questionsAsked.forEach((question, questionId) => {
        if (!answersGiven.has(questionId)) {
          unansweredQuestions.push(questionId);
        }
      });
      
      const result = unansweredQuestions.length > 0;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:492',message:'hasUnansweredQuestion: result',data:{totalQuestions:questionsAsked.size,answeredQuestions:answersGiven.size,unansweredCount:unansweredQuestions.length,unansweredQuestionIds:unansweredQuestions,result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      return result;
    };
    
    // Helper: Get current question sequence count (resets after answer)
    const getCurrentQuestionSequence = (messages) => {
      let sequenceCount = 0;
      let lastAnswerIndex = -1;
      
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user' && msg.content?.toLowerCase().startsWith('selected:')) {
          lastAnswerIndex = i;
          break;
        }
      }
      
      for (let i = lastAnswerIndex + 1; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'assistant' && msg.type === 'question') {
          sequenceCount++;
        }
      }
      
      return sequenceCount;
    };
    
    // Build rich context data
    const hasExistingDiagram = currentGraph && currentGraph.children && currentGraph.children.length > 0;
    const nodeCount = hasExistingDiagram ? currentGraph.children.length : 0;
    
    const agentContext = {
      canvas: {
        isEmpty: !hasExistingDiagram,
        nodeCount: nodeCount,
        edgeCount: currentGraph?.edges?.length || 0,
        fullGraph: currentGraph ? JSON.stringify(currentGraph, null, 2) : null,
        allNodeLabels: extractAllLabels(currentGraph),
        allGroupLabels: extractAllGroupLabels(currentGraph),
        allEdgeLabels: extractAllEdgeLabels(currentGraph)
      },
      selection: {
        selectedNodeIds: selectedNodeIds || [],
        selectedEdgeIds: selectedEdgeIds || [],
        selectedNodeDetails: getSelectedNodeDetails(currentGraph, selectedNodeIds),
        selectedEdgeDetails: getSelectedEdgeDetails(currentGraph, selectedEdgeIds),
        selectedGroupIds: getSelectedGroupIds(currentGraph, selectedNodeIds),
        selectedGroupDetails: getSelectedGroupDetails(currentGraph, selectedNodeIds),
        hasSelection: (selectedNodeIds?.length > 0) || (selectedEdgeIds?.length > 0),
        hasGroupSelection: getSelectedGroupIds(currentGraph, selectedNodeIds).length > 0
      },
      conversation: (() => {
        const { questionsAsked, answersGiven } = getQuestionAnswerTracking(messages);
        return {
          allMessages: messages,
          messageCount: messages.length,
          hasUnansweredQuestion: hasUnansweredQuestion(messages),
          currentQuestionCount: getCurrentQuestionSequence(messages),
          totalQuestionsAsked: questionsAsked.size,
          questionsAnswered: answersGiven.size,
          unansweredQuestions: Array.from(questionsAsked.keys()).filter(qId => !answersGiven.has(qId)),
          lastUserMessage: messages.filter(m => m.role === 'user').pop()?.content || null,
          lastAssistantMessage: messages.filter(m => m.role === 'assistant').pop() || null,
          conversationSummary: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content?.substring(0, 200),
            type: m.type || null
          }))
        };
      })(),
      images: {
        count: images?.length || 0,
        hasImages: (images?.length || 0) > 0,
        shouldCreateFromImage: (images?.length || 0) > 0
      }
    };
    
    console.log('📊 Agent Context:', JSON.stringify(agentContext, null, 2));
    console.log('🔍 CRITICAL DEBUG - Request details:');
    console.log('  - Messages count:', messages.length);
    console.log('  - Last user message:', agentContext.conversation.lastUserMessage);
    console.log('  - Has unanswered question:', agentContext.conversation.hasUnansweredQuestion);
    console.log('  - Total questions asked:', agentContext.conversation.totalQuestionsAsked);
    console.log('  - Questions answered:', agentContext.conversation.questionsAnswered);
    console.log('  - Canvas empty:', agentContext.canvas.isEmpty);
    console.log('  - Has selection:', agentContext.selection.hasSelection);
    console.log('  - Has images:', agentContext.images.hasImages);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:540',message:'Agent context calculated',data:{canvasIsEmpty:agentContext.canvas.isEmpty,canvasNodeCount:agentContext.canvas.nodeCount,canvasEdgeCount:agentContext.canvas.edgeCount,hasImages:agentContext.images.hasImages,shouldCreateFromImage:agentContext.images.shouldCreateFromImage,totalQuestionsAsked:agentContext.conversation.totalQuestionsAsked,questionsAnswered:agentContext.conversation.questionsAnswered,hasUnansweredQuestion:agentContext.conversation.hasUnansweredQuestion,hasSelection:agentContext.selection.hasSelection,currentGraphChildren:currentGraph?.children?.length||0,currentGraphStructure:currentGraph?JSON.stringify({id:currentGraph.id,childrenCount:currentGraph.children?.length,edgesCount:currentGraph.edges?.length}):'null'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Build context-rich system prompt
    const systemPromptContent = `You are an architecture design assistant. Your goal is to help users create accurate, useful architecture diagrams.

**RAW CONTEXT DATA (use this to inform your decisions):**

1. CANVAS STATE:
   - Is empty: ${agentContext.canvas.isEmpty}
   - Node count: ${agentContext.canvas.nodeCount}
   - Edge count: ${agentContext.canvas.edgeCount}
   - All node labels: ${JSON.stringify(agentContext.canvas.allNodeLabels)}
   - All group labels: ${JSON.stringify(agentContext.canvas.allGroupLabels)}
   - All edge labels: ${JSON.stringify(agentContext.canvas.allEdgeLabels)}
   ${agentContext.canvas.fullGraph ? `
   - Full graph structure:
${agentContext.canvas.fullGraph}
   ` : ''}

2. SELECTION STATE:
   - Has selection: ${agentContext.selection.hasSelection}
   - Selected node IDs: ${JSON.stringify(agentContext.selection.selectedNodeIds)}
   - Selected edge IDs: ${JSON.stringify(agentContext.selection.selectedEdgeIds)}
   ${agentContext.selection.selectedNodeDetails.length > 0 ? `
   - Selected node details:
${JSON.stringify(agentContext.selection.selectedNodeDetails, null, 2)}
   ` : ''}
   ${agentContext.selection.selectedGroupDetails.length > 0 ? `
   - Selected group details:
${JSON.stringify(agentContext.selection.selectedGroupDetails, null, 2)}
   ` : ''}

3. CONVERSATION STATE:
   - Total messages: ${agentContext.conversation.messageCount}
   - Has unanswered question: ${agentContext.conversation.hasUnansweredQuestion}
   - **UNANSWERED QUESTIONS COUNT: ${agentContext.conversation.unansweredQuestions.length}** (MUST be 0 before asking new questions)
   - Total questions asked: ${agentContext.conversation.totalQuestionsAsked}
   - Questions answered: ${agentContext.conversation.questionsAnswered}
   - Last user message: "${agentContext.conversation.lastUserMessage}"
   - Recent conversation:
${JSON.stringify(agentContext.conversation.conversationSummary, null, 2)}

4. IMAGES:
   - Has images: ${agentContext.images.hasImages}
   ${agentContext.images.shouldCreateFromImage ? `
   - **User provided image(s). Create architecture from the image.**
   ` : ''}

${selectionContext}

**GUIDELINES:**

- **If images provided:** Create architecture from the image (don't ask questions)

- **CRITICAL: If there's an unanswered question:** DO NOT ask new questions. Wait for ALL unanswered questions to be answered before asking another question or creating a diagram. Check `conversation.unansweredQuestions` count - if > 0, you MUST wait.

- **When to ask a clarifying question:**
  - The user's request is vague or ambiguous and you need information to create an accurate design
  - Asking ONE question would significantly improve design accuracy
  - You're starting a new design (not just modifying existing elements)
  - Note: Selection doesn't prevent asking questions - user may want to create a new diagram even with something selected

- **When to create a diagram:**
  - You have enough information to create an accurate design
  - The user's request is specific and clear
  - User has answered a question (create based on their answer)
  - User has selected elements and wants to modify them (clear intent from selection + message)

**QUESTION GUIDELINES:**
- Ask ONE question at a time (single-select radio)
- Wait for user to answer before asking another
- Focus on questions that enable more accurate design communication
- After receiving an answer, create the diagram (don't ask follow-ups unless truly critical)

**BIAS:**
- Prefer creating diagrams when you have enough information
- Ask questions only when they meaningfully improve design accuracy
- For new designs: Ask 1-2 questions if needed, then create
- For modifications: Usually act immediately (user intent is clear from selection/context)`;
    
    // DEBUG: Log system prompt details
    console.log('📝 SYSTEM PROMPT DEBUG:');
    console.log('  - Total length:', systemPromptContent.length, 'characters');
    console.log('  - Graph state description length:', graphStateDescription.length, 'characters');
    console.log('  - Selection context length:', selectionContext.length, 'characters');
    console.log('  - Selection context is empty?', selectionContext.length === 0);
    if (selectionContext.length > 0) {
      console.log('  - Selection context preview (first 500 chars):', selectionContext.substring(0, 500));
    } else {
      console.log('  - ⚠️ WARNING: Selection context is EMPTY!');
      console.log('  - selectedNodeIds:', selectedNodeIds, 'length:', selectedNodeIds?.length);
      console.log('  - selectedEdgeIds:', selectedEdgeIds, 'length:', selectedEdgeIds?.length);
    }
    
    // Determine tool choice value before creating the request
    // Force create_architecture_diagram if questions answered or limit reached
    // Force ask_clarifying_question ONLY if no questions asked yet AND no answers received
    // Non-deterministic: Let LLM decide based on context and prompt guidance
    // Only force create if there's an unanswered question (wait for answer)
    const toolChoiceValue = agentContext.conversation.hasUnansweredQuestion 
      ? "auto"  // Wait for user to answer
      : "auto";  // Let LLM decide based on prompt guidance
    
    // #region agent log
    console.log('🔍 TOOL CHOICE DEBUG (Non-deterministic):');
    console.log('  - hasUnansweredQuestion:', agentContext.conversation.hasUnansweredQuestion);
    console.log('  - toolChoiceValue:', toolChoiceValue);
    console.log('  - Context provided, LLM will decide based on prompt');
    fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:695',message:'Tool choice decision made',data:{hasUnansweredQuestion:agentContext.conversation.hasUnansweredQuestion,toolChoiceValue,totalQuestionsAsked:agentContext.conversation.totalQuestionsAsked,questionsAnswered:agentContext.conversation.questionsAnswered,messageCount:messages.length,lastUserMessage:agentContext.conversation.lastUserMessage?.substring(0,100),messagesStructure:messages.map(m=>({role:m.role,type:m.type,content:m.content?.substring(0,50)}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    // Create chat completion with streaming and tools
    const stream = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: systemPromptContent
        },
        ...processedMessages
      ],
      stream: true,
      temperature: 0.4, // Slightly higher for better contextual decisions
      max_tokens: 1024,
      // CRITICAL: Disable parallel tool calls to ensure only ONE tool call is made
      parallel_tool_calls: false,
      tool_choice: toolChoiceValue,
      tools: [
        {
          type: "function",
          function: {
            name: "ask_clarifying_question",
            description: "Ask ONE clarifying question when the user's request is vague or ambiguous (e.g., 'make llm assessor', 'create a payment system', 'build a chat app') and you need information to create an accurate design. For vague new design requests, asking a question FIRST improves accuracy. Ask questions that enable more accurate design communication. **CRITICAL: DO NOT use this tool if there are ANY unanswered questions (check conversation.unansweredQuestions count - must be 0). Wait for ALL unanswered questions to be answered before asking a new question.**",
            parameters: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "ONE concise question that helps you make a critical decision"
                },
                question_type: {
                  type: "string",
                  enum: ["radio"],
                  description: "Always 'radio' for single-select (user picks ONE option)"
                },
                options: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  minItems: 4,
                  maxItems: 4,
                  description: "Exactly 4 options. User selects ONE."
                }
              },
              required: ["question", "question_type", "options"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "create_architecture_diagram",
            description: "Create a new architecture diagram or modify an existing one. Use when you have SPECIFIC and CLEAR information (e.g., 'create a REST API with Express, PostgreSQL, and Redis'). For vague requests (e.g., 'make llm assessor'), prefer asking a question first. If images are provided, use this immediately. If user has selected elements or mentioned specific diagram parts, use this to modify.",
            parameters: {
              type: "object",
              properties: {
                requirements_summary: {
                  type: "string",
                  description: "A clear summary of the user's architecture requirements based on the conversation"
                },
                architecture_type: {
                  type: "string",
                  description: "The type of architecture being requested (e.g., microservices, serverless, monolith, etc.)"
                }
              },
              required: ["requirements_summary", "architecture_type"]
            }
          }
        }
      ]
    });

    console.log('📦 Starting to stream response...');
    let toolCallDetected = false;
    let toolCallData = null;
    let accumulatedArguments = '';
    // Track tool calls by index to handle multiple tool calls
    const toolCallsByIndex = new Map();
    
    // Stream the response
    for await (const chunk of stream) {
      const data = JSON.stringify(chunk);
      console.log('📤 Streaming chunk:', data);
      
      // Check if this chunk contains a tool call
      if (chunk.choices?.[0]?.delta?.tool_calls) {
        toolCallDetected = true;
        console.log('🔧 Tool call detected in chunk');
        console.log('🔍 Tool call chunk:', JSON.stringify(chunk.choices[0].delta.tool_calls, null, 2));
        
        // Process each tool call in the chunk
        for (const toolCallDelta of chunk.choices[0].delta.tool_calls) {
          const index = toolCallDelta.index;
          
          // Initialize tool call tracking for this index
          if (!toolCallsByIndex.has(index)) {
            toolCallsByIndex.set(index, {
              id: toolCallDelta.id,
              name: toolCallDelta.function?.name,
              arguments: ''
            });
          }
          
          const toolCall = toolCallsByIndex.get(index);
          
          // Update tool call data
          if (toolCallDelta.function?.name) {
            toolCall.name = toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            toolCall.arguments += toolCallDelta.function.arguments;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:470',message:'Tool call arguments updated',data:{index,currentArgs:toolCall.arguments.substring(0,200),newChunk:toolCallDelta.function.arguments.substring(0,50),totalLength:toolCall.arguments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            console.log(`📝 Tool call ${index} (${toolCall.name}) args length: ${toolCall.arguments.length}, new chunk: "${toolCallDelta.function.arguments.substring(0, 50)}"`);
          }
          
          // Track the first ask_clarifying_question tool call
          if (toolCall.name === 'ask_clarifying_question' && !toolCallData) {
            toolCallData = {
              function: { name: toolCall.name },
              index: index
            };
            accumulatedArguments = toolCall.arguments;
            console.log('❓ Clarifying question tool call detected (index:', index, ')');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:810',message:'Model chose ask_clarifying_question',data:{index,toolCallName:toolCall.name,expectedToolChoice:JSON.stringify(toolChoiceValue)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          } else if (toolCall.name === 'create_architecture_diagram' && !toolCallData) {
            toolCallData = {
              function: { name: toolCall.name },
              index: index
            };
            accumulatedArguments = toolCall.arguments;
            console.log('🏗️ Architecture diagram tool call detected (index:', index, ')');
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:817',message:'Model chose create_architecture_diagram',data:{index,toolCallName:toolCall.name,expectedToolChoice:JSON.stringify(toolChoiceValue),canvasIsEmpty:agentContext.canvas.isEmpty,totalQuestionsAsked:agentContext.conversation.totalQuestionsAsked,questionsAnswered:agentContext.conversation.questionsAnswered},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
          }
        }
        
        // Update accumulated arguments from the tracked tool call
        if (toolCallData && toolCallsByIndex.has(toolCallData.index)) {
          accumulatedArguments = toolCallsByIndex.get(toolCallData.index).arguments;
          console.log('📝 Accumulated arguments so far:', accumulatedArguments.substring(0, 200));
        }
      }
      
      res.write(`data: ${data}\n\n`);
    }

    // Process all tool calls
    let questionProcessed = false;
    let diagramMessageSent = false; // Track if we've sent diagram creation message
    
    if (toolCallDetected && toolCallsByIndex.size > 0) {
      console.log('🛠️ Processing tool calls...');
      console.log('🔍 Found', toolCallsByIndex.size, 'tool call(s)');
      console.log('🔍 Tool call details:', Array.from(toolCallsByIndex.entries()).map(([i, tc]) => ({index: i, name: tc.name, argsLength: tc.arguments.length})));
      
      // Process ask_clarifying_question first if it exists
      for (const [index, toolCall] of toolCallsByIndex.entries()) {
        if (toolCall.name === 'ask_clarifying_question' && !questionProcessed) {
          console.log('🛠️ Processing ask_clarifying_question (index:', index, ')');
          console.log('📝 Accumulated arguments:', toolCall.arguments.substring(0, 300));
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:510',message:'Starting to process ask_clarifying_question',data:{index,rawArgsLength:toolCall.arguments.length,rawArgsPreview:toolCall.arguments.substring(0,300),allToolCalls:Array.from(toolCallsByIndex.entries()).map(([i,tc])=>({index:i,name:tc.name,argsLength:tc.arguments.length}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
      
      try {
        // Parse the accumulated tool call arguments
            let cleanedArgs = toolCall.arguments.trim();
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:516',message:'Before brace counting',data:{cleanedArgsLength:cleanedArgs.length,cleanedArgsPreview:cleanedArgs.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Find the FIRST complete JSON object by finding matching braces
            // Handle strings properly (don't count braces inside strings)
            let braceCount = 0;
            let lastValidIndex = -1;
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < cleanedArgs.length; i++) {
              const char = cleanedArgs[i];
              
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') {
                  braceCount++;
                } else if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    lastValidIndex = i;
                    break; // Found first complete object
                  }
                }
              }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:530',message:'After brace counting',data:{lastValidIndex,cleanedArgsLength:cleanedArgs.length,charsAfterFirstObject:cleanedArgs.length-lastValidIndex-1,previewAfterFirstObject:cleanedArgs.substring(lastValidIndex+1,lastValidIndex+50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            if (lastValidIndex > 0) {
              cleanedArgs = cleanedArgs.substring(0, lastValidIndex + 1);
            } else {
              // Fallback: try progressive JSON parsing from the start
              // Try to find a valid JSON object by progressively trying longer substrings
              let foundValid = false;
              for (let endPos = cleanedArgs.length; endPos > 0 && !foundValid; endPos--) {
                try {
                  const testStr = cleanedArgs.substring(0, endPos);
                  JSON.parse(testStr);
                  cleanedArgs = testStr;
                  foundValid = true;
                  console.log('✅ Found valid JSON at position:', endPos);
                } catch (e) {
                  // Continue trying shorter strings
                }
              }
              
              if (!foundValid) {
                // Last resort: try to find last closing brace
                const lastBraceIndex = cleanedArgs.lastIndexOf('}');
                if (lastBraceIndex > 0) {
                  cleanedArgs = cleanedArgs.substring(0, lastBraceIndex + 1);
                }
              }
            }
            
            console.log('📝 Cleaned arguments length:', cleanedArgs.length);
            console.log('🔍 DEBUG: Final cleanedArgs (first 500 chars):', cleanedArgs.substring(0, 500));
            console.log('🔍 DEBUG: Final cleanedArgs (last 100 chars):', cleanedArgs.substring(Math.max(0, cleanedArgs.length - 100)));
            console.log('🔍 DEBUG: All tool calls in map:', Array.from(toolCallsByIndex.entries()).map(([i, tc]) => ({index: i, name: tc.name, argsLength: tc.arguments.length, argsPreview: tc.arguments.substring(0, 100)})));
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:543',message:'Before JSON.parse',data:{finalCleanedArgs:cleanedArgs,length:cleanedArgs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            // Try to parse - use progressive parsing to find valid JSON
            let args;
            let parseSuccess = false;
            
            // First try the cleaned args as-is
            try {
              args = JSON.parse(cleanedArgs);
        console.log('📋 Parsed tool call arguments:', args);
              parseSuccess = true;
            } catch (parseError) {
              console.log('⚠️ Direct parse failed, trying progressive parsing...');
              console.log('⚠️ Error:', parseError.message);
              
              // Progressive parsing: try from end backwards to find longest valid JSON
              for (let endPos = cleanedArgs.length; endPos > 10 && !parseSuccess; endPos--) {
                try {
                  const testStr = cleanedArgs.substring(0, endPos);
                  args = JSON.parse(testStr);
                  console.log('✅ Progressive parsing succeeded at position:', endPos, 'out of', cleanedArgs.length);
                  parseSuccess = true;
                  cleanedArgs = testStr; // Update cleanedArgs for consistency
                  break;
                } catch (e) {
                  // Continue trying shorter strings
                }
              }
              
              if (!parseSuccess) {
                console.error('❌ All parsing attempts failed');
                throw parseError; // Re-throw to trigger error recovery
              }
            }
            
            // Validate required fields for question
            if (!args.question || !args.question_type || !args.options) {
              throw new Error(`Missing required fields for question. Got: ${JSON.stringify(args)}`);
            }
            
            if (!Array.isArray(args.options) || args.options.length !== 4) {
              throw new Error(`Options must be an array with exactly 4 items. Got: ${JSON.stringify(args.options)}`);
            }
            
            // Format options with IDs
            const formattedOptions = args.options.map((option, optIndex) => ({
              id: `opt_${Date.now()}_${optIndex}`,
              text: option
            }));
            
            // Send question message in the format expected by RightPanelChat
            // Always use radio-question since tool definition only allows radio
            const questionMessage = {
              type: "question",
              question_type: 'radio-question', // Always radio (single-select) as per tool definition
              question: args.question,
              options: formattedOptions
            };
            
            console.log('📤 Sending question message:', questionMessage);
            res.write(`data: ${JSON.stringify(questionMessage)}\n\n`);
            console.log('✅ Question sent successfully');
            questionProcessed = true;
            break;
          } catch (error) {
            console.error('❌ Error processing ask_clarifying_question (index:', index, '):', error.message);
            console.error('❌ Arguments (first 500):', toolCall.arguments.substring(0, 500));
            console.error('❌ Arguments (last 200):', toolCall.arguments.substring(Math.max(0, toolCall.arguments.length - 200)));
            console.error('❌ Error position:', error.message.match(/position (\d+)/)?.[1]);
            console.error('❌ All tool calls:', Array.from(toolCallsByIndex.entries()).map(([i, tc]) => ({index: i, name: tc.name, argsLength: tc.arguments.length})));
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:575',message:'JSON parse error caught',data:{errorMessage:error.message,rawArgs:toolCall.arguments,rawArgsLength:toolCall.arguments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Try error recovery - extract first complete JSON object using proper brace counting
            let recoveryArgs = toolCall.arguments.trim();
            let recoveryBraceCount = 0;
            let recoveryLastValidIndex = -1;
            let recoveryInString = false;
            let recoveryEscapeNext = false;
            
            for (let i = 0; i < recoveryArgs.length; i++) {
              const char = recoveryArgs[i];
              
              if (recoveryEscapeNext) {
                recoveryEscapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                recoveryEscapeNext = true;
                continue;
              }
              
              if (char === '"' && !recoveryEscapeNext) {
                recoveryInString = !recoveryInString;
                continue;
              }
              
              if (!recoveryInString) {
                if (char === '{') {
                  recoveryBraceCount++;
                } else if (char === '}') {
                  recoveryBraceCount--;
                  if (recoveryBraceCount === 0) {
                    recoveryLastValidIndex = i;
                    break;
                  }
                }
              }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:609',message:'Error recovery brace counting',data:{recoveryLastValidIndex,recoveryArgsLength:recoveryArgs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            if (recoveryLastValidIndex > 0) {
              try {
                const extractedJson = recoveryArgs.substring(0, recoveryLastValidIndex + 1);
                const args = JSON.parse(extractedJson);
                const formattedOptions = args.options.map((option, optIndex) => ({
                  id: `opt_${Date.now()}_${optIndex}`,
                  text: option
                }));
                const questionMessage = {
                  type: "question",
                  question_type: 'radio-question', // Always radio (single-select) as per tool definition
                  question: args.question,
                  options: formattedOptions
                };
                res.write(`data: ${JSON.stringify(questionMessage)}\n\n`);
                console.log('✅ Question sent successfully (error recovery)');
                questionProcessed = true;
                break;
              } catch (recoveryError) {
                console.error('❌ Error recovery also failed:', recoveryError.message);
                // Try progressive parsing as last resort
                let progressiveFound = false;
                for (let endPos = recoveryArgs.length; endPos > 0 && !progressiveFound; endPos--) {
                  try {
                    const testStr = recoveryArgs.substring(0, endPos);
                    const testArgs = JSON.parse(testStr);
                    if (testArgs.question && testArgs.options) {
                      const formattedOptions = testArgs.options.map((option, optIndex) => ({
                        id: `opt_${Date.now()}_${optIndex}`,
                        text: option
                      }));
                      const questionMessage = {
                        type: "question",
                        question_type: 'radio-question', // Always radio (single-select) as per tool definition
                        question: testArgs.question,
                        options: formattedOptions
                      };
                      res.write(`data: ${JSON.stringify(questionMessage)}\n\n`);
                      console.log('✅ Question sent successfully (progressive recovery)');
                      questionProcessed = true;
                      progressiveFound = true;
                      break;
                    }
                  } catch (e) {
                    // Continue
                  }
                }
                if (!progressiveFound) {
                  console.error('❌ All recovery methods failed');
                }
              }
            } else {
              console.error('❌ Could not find first complete JSON object for recovery');
            }
          }
        }
      }
      
      // If we didn't process ask_clarifying_question, try create_architecture_diagram
      // Find the FIRST create_architecture_diagram tool call and process ONLY that one
      if (!questionProcessed && !diagramMessageSent) {
        // Log all tool calls to see what we received
        const allToolCalls = Array.from(toolCallsByIndex.entries());
        console.log('🔍 DEBUG: All tool calls received:', allToolCalls.map(([idx, tc]) => ({index: idx, name: tc.name, argsLength: tc.arguments.length})));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/chat.js:1119',message:'All tool calls received from model',data:{allToolCalls:allToolCalls.map(([idx,tc])=>({index:idx,name:tc.name,argsLength:tc.arguments.length})),expectedToolChoice:JSON.stringify(toolChoiceValue),questionProcessed,diagramMessageSent},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // Find ALL create_architecture_diagram tool calls
        const allCreateDiagramCalls = allToolCalls.filter(
          ([index, toolCall]) => toolCall.name === 'create_architecture_diagram'
        );
        
        console.log('🔍 DEBUG: Found', allCreateDiagramCalls.length, 'create_architecture_diagram tool call(s)');
        if (allCreateDiagramCalls.length > 1) {
          console.error('❌ ERROR: Model created', allCreateDiagramCalls.length, 'create_architecture_diagram tool calls despite parallel_tool_calls: false');
          allCreateDiagramCalls.forEach(([idx, tc]) => {
            console.error(`  - Index ${idx}: args length ${tc.arguments.length}`);
          });
        }
        
        // Process ONLY the first one
        const createDiagramToolCall = allCreateDiagramCalls[0];
        
        if (createDiagramToolCall) {
          const [index, toolCall] = createDiagramToolCall;
          console.log('🛠️ Processing create_architecture_diagram (index:', index, ') - FIRST ONE ONLY');
          console.log('🔍 Total tool calls found:', toolCallsByIndex.size, '- Processing ONLY index', index);
            
            try {
              let cleanedArgs = toolCall.arguments.trim();
              let braceCount = 0;
              let lastValidIndex = -1;
              let inString = false;
              let escapeNext = false;
              
              for (let i = 0; i < cleanedArgs.length; i++) {
                const char = cleanedArgs[i];
                
                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }
                
                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }
                
                if (char === '"' && !escapeNext) {
                  inString = !inString;
                  continue;
                }
                
                if (!inString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      lastValidIndex = i;
                      break;
                    }
                  }
                }
              }
              
              if (lastValidIndex > 0) {
                cleanedArgs = cleanedArgs.substring(0, lastValidIndex + 1);
              } else {
                // Fallback: progressive parsing
                let foundValid = false;
                for (let endPos = cleanedArgs.length; endPos > 0 && !foundValid; endPos--) {
                  try {
                    const testStr = cleanedArgs.substring(0, endPos);
                    JSON.parse(testStr);
                    cleanedArgs = testStr;
                    foundValid = true;
                  } catch (e) {
                    // Continue
                  }
                }
              }
              
              const args = JSON.parse(cleanedArgs);
        
        // Validate required fields
        if (!args.requirements_summary || !args.architecture_type) {
          throw new Error(`Missing required fields. Got: ${JSON.stringify(args)}`);
        }
        
              // Send a message indicating diagram creation (the agent's decision)
        const diagramMessage = {
          type: "diagram_creation",
          message: `Creating architecture diagram for: ${args.architecture_type}`,
          requirements: args.requirements_summary,
          architecture_type: args.architecture_type
        };
        
              // CRITICAL: Only send message once, even if somehow we process multiple tool calls
              if (!diagramMessageSent) {
                console.log('📤 Sending diagram creation message (agent decision):', diagramMessage);
                res.write(`data: ${JSON.stringify(diagramMessage)}\n\n`);
                console.log('✅ Diagram creation message sent');
                diagramMessageSent = true;
              } else {
                console.log('⏭️ SKIPPING: Diagram creation message already sent (duplicate prevention)');
              }
            } catch (error) {
              console.error('❌ Error processing create_architecture_diagram:', error.message);
            }
          }
      }
    }
    
    // Final error handling if nothing was processed
    if (toolCallDetected && !questionProcessed && accumulatedArguments) {
      console.error('❌ No tool call was successfully processed');
      console.error('❌ Accumulated arguments (first 500):', accumulatedArguments.substring(0, 500));
      
      // Try one more time with error recovery
      const jsonMatch = accumulatedArguments.match(/^\{[\s\S]*?\}(?=\s*\{|$)/);
      if (jsonMatch) {
        try {
          const args = JSON.parse(jsonMatch[0]);
          if (args.question && args.options) {
            const formattedOptions = args.options.map((option, optIndex) => ({
              id: `opt_${Date.now()}_${optIndex}`,
              text: option
            }));
            const questionMessage = {
              type: "question",
              question_type: 'checkbox-question', // Always checkbox (multiselect)
              question: args.question,
              options: formattedOptions
            };
            res.write(`data: ${JSON.stringify(questionMessage)}\n\n`);
            console.log('✅ Question sent successfully (final error recovery)');
            questionProcessed = true;
          }
        } catch (finalError) {
          console.error('❌ Final error recovery failed:', finalError.message);
          const errorMessage = {
            type: "error",
            message: `Failed to process tool call: ${finalError.message}`
          };
          res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
        }
      } else {
        const errorMessage = {
          type: "error",
          message: `Failed to process tool call: Could not parse tool arguments`
        };
        res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
      }
    } else {
      console.log('ℹ️ No tool call detected or tool call data missing');
      console.log('🔍 toolCallDetected:', toolCallDetected);
      console.log('🔍 toolCallData:', toolCallData);
      console.log('🔍 accumulatedArguments:', accumulatedArguments);
    }

    console.log('✅ Stream completed, sending [DONE]');
    // Send completion signal
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error.code === 'insufficient_quota') {
      res.status(402).json({ 
        error: 'Insufficient quota',
        message: 'OpenAI API quota exceeded. Please check your billing.'
      });
    } else if (error.code === 'invalid_api_key') {
      res.status(401).json({ 
        error: 'Invalid API key',
        message: 'Please check your OpenAI API key in the .env file'
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred'
      });
    }
  }
}
