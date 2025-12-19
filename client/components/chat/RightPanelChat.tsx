"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Cpu,
  MessageSquarePlus
} from "lucide-react"
import { cn } from "../../lib/utils"
import ReactMarkdown from "react-markdown"
import { getChatMessages, type PersistedChatMessage, clearEmbedToCanvasFlag } from "../../utils/chatPersistence"
import { useViewMode } from "../../contexts/ViewModeContext"

// Canvas toolbar blue for consistency
const BLUE_HEX = "#4285F4";
const BLUE_HEX_OPACITY = "#4285F480";

interface RightPanelChatProps {
  className?: string
  isCollapsed: boolean
  onToggleCollapse?: () => void
  currentGraph?: any // Add current graph prop
  selectedNodeIds?: string[] // Selected nodes/groups for context
  selectedEdgeIds?: string[] // Selected edges for context
}

interface QuestionOption {
  id: string
  text: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isStreaming?: boolean
  images?: string[] // Array of data URLs for images
  // Question fields (matching ChatWindow format)
  type?: 'radio-question' | 'checkbox-question'
  question?: string
  options?: QuestionOption[]
}

const RightPanelChat: React.FC<RightPanelChatProps> = ({
  className,
  isCollapsed,
  onToggleCollapse,
  currentGraph,
  selectedNodeIds = [],
  selectedEdgeIds = []
}) => {
  const { config } = useViewMode();
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesRef = useRef<ChatMessage[]>([]) // Ref to store latest messages for use in setTimeout callbacks
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isDiagramGenerating, setIsDiagramGenerating] = useState(false)
  // Use ref for synchronous duplicate prevention (state updates are async)
  const isDiagramGeneratingRef = useRef(false)
  const diagramGenerationInProgressRef = useRef<string | null>(null) // Track the requirements being processed
  const pendingAutoTriggerRef = useRef<Set<string>>(new Set()) // Track pending auto-triggers to prevent duplicates
  const apiCallQueuedRef = useRef<Set<string>>(new Set()) // Track if setTimeout has already been queued for a triggerKey
  const apiCallProcessingRef = useRef<Set<string>>(new Set()) // Track which triggerKeys are currently being processed by setTimeout callback
  const apiCallMadeRef = useRef<Set<string>>(new Set()) // Track which triggerKeys have already had API calls made
  const [isMinimized, setIsMinimized] = useState(false)
  const [pastedImages, setPastedImages] = useState<string[]>([]) // Array of data URLs
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | string[]>>({})
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedTriggerIds = useRef<Set<string>>(new Set()) // Track processed diagram_creation messages to prevent duplicates
  const pendingAutoTriggers = useRef<Set<string>>(new Set()) // Track pending auto-triggers to prevent duplicates

  // Load persisted messages on mount and when storage changes
  const loadMessages = useCallback(() => {
    const persistedMessages = getChatMessages();
    if (persistedMessages.length > 0) {
      const chatMessages: ChatMessage[] = persistedMessages.map(msg => {
        const chatMsg: ChatMessage = {
          id: msg.id,
          role: msg.sender,
          content: msg.content,
          timestamp: new Date(msg.timestamp)
        };
        // Include question fields if they exist
        if ((msg as any).type) {
          chatMsg.type = (msg as any).type as 'radio-question' | 'checkbox-question';
        }
        if ((msg as any).question) {
          chatMsg.question = (msg as any).question;
        }
        if ((msg as any).options) {
          chatMsg.options = (msg as any).options;
        }
        return chatMsg;
      });
      setMessages(chatMessages);
      console.log('📥 Loaded persisted chat messages:', chatMessages.length);
    } else {
      // Clear messages if localStorage is empty
      setMessages([]);
      console.log('📥 No persisted messages, cleared chat');
    }
    
    // Clear the embed-to-canvas flag after loading messages
    clearEmbedToCanvasFlag();
  }, []);

  // Keep messagesRef in sync with messages state for use in setTimeout callbacks
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    loadMessages();
    
    // Listen for storage changes (e.g., when resetCanvas() clears chat)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'atelier_current_conversation' || e.key === null) {
        loadMessages();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom events (for same-window updates)
    const handleCustomStorage = () => {
      console.log('💬 [RightPanelChat] Received chatCleared event, reloading messages');
      loadMessages();
      // Also clear input value when conversation is cleared
      setInputValue('');
    };
    window.addEventListener('chatCleared', handleCustomStorage);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('chatCleared', handleCustomStorage);
    };
  }, [loadMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    // Messages changed, attempting to scroll
    if (messagesEndRef.current && !isMinimized) {
      // Scrolling to bottom
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    } else {
      // Cannot scroll - element not available or minimized
    }
  }, [messages, isMinimized])

  // Auto-focus input when component mounts
  useEffect(() => {
    if (inputRef.current && !isMinimized) {
      inputRef.current.focus({ preventScroll: true })
    }
  }, [isMinimized])

  // Handle paste events to detect images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior for images
        
        const file = item.getAsFile();
        if (!file) continue;

        // Compress image before converting to base64
        const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.8): Promise<string> => {
          return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
              // Calculate new dimensions
              let { width, height } = img;
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              // Draw and compress
              ctx?.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg', quality);
              resolve(dataUrl);
            };
            
            img.src = URL.createObjectURL(file);
          });
        };

        // Convert to compressed base64 data URL
        compressImage(file).then((dataUrl) => {
          console.log('📸 Image compressed and added:', dataUrl.substring(0, 50) + '...');
          setPastedImages(prev => [...prev, dataUrl]);
        }).catch((error) => {
          console.error('❌ Image compression failed:', error);
        });
      }
    }
  }, []);

  // Remove an image from the pasted images list
  const removeImage = useCallback((index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const callOpenAI = async (userMessage: string, images?: string[], messagesOverride?: ChatMessage[]) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:211',message:'callOpenAI called',data:{userMessage:userMessage.substring(0,100),hasImages:!!images,imagesCount:images?.length||0,isDiagramGenerating},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.log('🚀 Starting OpenAI call with message:', userMessage)
    console.log('📸 Images provided:', images?.length || 0)
    
    // Store images globally for the agent to access
    if (images && images.length > 0) {
      (window as any).selectedImages = images;
      console.log('🌍 Stored images globally for agent:', images.length);
    } else {
      (window as any).selectedImages = [];
    }
    
    // Get current graph from global state (set by InteractiveCanvas) - ensure it's always the latest
    const currentGraphFromGlobal = (window as any).currentGraph || currentGraph;
    // Ensure currentGraph is always a valid object (API expects object, not null/undefined)
    const safeCurrentGraph = currentGraphFromGlobal && typeof currentGraphFromGlobal === 'object' 
      ? currentGraphFromGlobal 
      : { id: "root", children: [], edges: [] };
    
    // Get selections from global state (updated by InteractiveCanvas) or props
    const selectedNodeIdsFromGlobal = Array.isArray((window as any).selectedNodeIds) 
      ? (window as any).selectedNodeIds 
      : (Array.isArray(selectedNodeIds) ? selectedNodeIds : []);
    const selectedEdgeIdsFromGlobal = Array.isArray((window as any).selectedEdgeIds) 
      ? (window as any).selectedEdgeIds 
      : (Array.isArray(selectedEdgeIds) ? selectedEdgeIds : []);
    
    console.log('📊 Current graph for chat:', safeCurrentGraph ? `${safeCurrentGraph.children?.length || 0} nodes` : 'none');
    console.log('🎯 Selected nodes for context:', selectedNodeIdsFromGlobal);
    console.log('🎯 Selected edges for context:', selectedEdgeIdsFromGlobal);
    
    // Use messagesOverride if provided (for immediate use of updated state), otherwise use current messages state
    const messagesToUse = messagesOverride || messages;
    // Ensure messages array is valid
    const validMessages = Array.isArray(messagesToUse) ? messagesToUse : [];
    
    // Check if userMessage already exists in messages (avoid duplicates)
    const userMessageAlreadyInHistory = validMessages.some(m => 
      m.role === 'user' && m.content === userMessage
    );
    
    // Build request body
    const requestBody = {
      messages: userMessageAlreadyInHistory
        ? validMessages.map(msg => ({ role: msg.role, content: msg.content || '' }))
        : [
            ...validMessages.map(msg => ({ role: msg.role, content: msg.content || '' })),
            { role: 'user', content: userMessage }
          ],
      currentGraph: safeCurrentGraph, // Always send valid graph object
      images: Array.isArray(images) ? images : [],
      selectedNodeIds: selectedNodeIdsFromGlobal,
      selectedEdgeIds: selectedEdgeIdsFromGlobal
    };
    
    // #region agent log - Log conversation history being sent to API
    const questionMessages = requestBody.messages.filter(m => m.content?.includes('Question') || m.content?.includes('?'));
    const answerMessages = requestBody.messages.filter(m => m.content?.toLowerCase().startsWith('selected:'));
    fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:260',message:'callOpenAI: conversation history being sent',data:{totalMessages:requestBody.messages.length,questionMessagesCount:questionMessages.length,answerMessagesCount:answerMessages.length,last3Messages:requestBody.messages.slice(-3).map(m=>({role:m.role,content:m.content?.substring(0,100)})),userMessage:userMessage.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // DEBUG: Log full request body
    console.log('📤 FULL REQUEST BODY TO CHAT API:');
    console.log('  - Messages count:', requestBody.messages.length);
    console.log('  - Current graph:', requestBody.currentGraph ? `${requestBody.currentGraph.children?.length || 0} nodes` : 'null/undefined');
    console.log('  - Selected node IDs:', requestBody.selectedNodeIds);
    console.log('  - Selected node IDs type:', typeof requestBody.selectedNodeIds, Array.isArray(requestBody.selectedNodeIds) ? 'is array' : 'NOT array');
    console.log('  - Selected node IDs length:', requestBody.selectedNodeIds?.length || 0);
    console.log('  - Selected edge IDs:', requestBody.selectedEdgeIds);
    console.log('  - Selected edge IDs type:', typeof requestBody.selectedEdgeIds, Array.isArray(requestBody.selectedEdgeIds) ? 'is array' : 'NOT array');
    console.log('  - Selected edge IDs length:', requestBody.selectedEdgeIds?.length || 0);
    console.log('  - Images:', requestBody.images?.length || 0);
    console.log('  - Full request body (stringified):', JSON.stringify(requestBody, null, 2));
    console.log('  - Selected node IDs in stringified:', JSON.stringify(requestBody.selectedNodeIds));
    
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:258',message:'Frontend: Before fetch call',data:{requestBodyKeys:Object.keys(requestBody),messagesCount:requestBody.messages?.length,hasCurrentGraph:!!requestBody.currentGraph,hasImages:!!requestBody.images,selectedNodeIdsType:typeof requestBody.selectedNodeIds,selectedNodeIdsLength:requestBody.selectedNodeIds?.length,selectedEdgeIdsType:typeof requestBody.selectedEdgeIds,selectedEdgeIdsLength:requestBody.selectedEdgeIds?.length,requestBodyStringLength:JSON.stringify(requestBody).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:266',message:'Frontend: After fetch call',data:{status:response.status,statusText:response.statusText,ok:response.ok,contentType:response.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      console.log('📡 Response status:', response.status)
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:270',message:'Frontend: HTTP error received',data:{status:response.status,errorText:errorText.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error('❌ HTTP error response:', errorText)
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      console.log('📖 Starting to read stream...')
      const decoder = new TextDecoder()
      let assistantMessage = ''

      // Create streaming message
      const streamingMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true
      }

      setMessages(prev => [...prev, streamingMessage])
      console.log('💬 Added streaming message to chat')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('✅ Stream completed')
          break
        }

        const chunk = decoder.decode(value)
        // console.log('📦 Received chunk:', chunk)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            // console.log('📊 Processing data:', data)
            
            if (data === '[DONE]') {
              console.log('🏁 Stream marked as done')
              // Mark streaming as complete
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === streamingMessage.id 
                    ? { ...msg, isStreaming: false }
                    : msg
                )
              )
              return
            }

            try {
              const parsed = JSON.parse(data)
              // console.log('🔍 Parsed data:', parsed)
              // console.log('🔍 Parsed data type:', parsed.type)
              
              // #region agent log
              if (parsed.type === 'diagram_creation' || parsed.type === 'question') {
                fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:349',message:'Stream message received',data:{type:parsed.type,message:parsed.message?.substring(0,50),requirements:parsed.requirements?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              }
              // #endregion
              
              // Handle diagram creation (agent's decision via create_architecture_diagram tool call)
              if (parsed.type === 'diagram_creation') {
                // #region agent log
                const diagramCreationId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
                fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:379',message:'Frontend: diagram_creation message received',data:{diagramCreationId,message:parsed.message?.substring(0,100),requirements:parsed.requirements?.substring(0,100),requirementsFull:parsed.requirements,isDiagramGenerating,isDiagramGeneratingRef:isDiagramGeneratingRef.current,inProgressRequirements:diagramGenerationInProgressRef.current,processedTriggerIdsSize:processedTriggerIds.current.size,processedTriggerIdsArray:Array.from(processedTriggerIds.current)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:356',message:'Checking isDiagramGenerating flag',data:{isDiagramGenerating,diagramCreationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                // Skip if diagram is already generating (prevents concurrent generation)
                // Use ref for synchronous check (state updates are async)
                if (isDiagramGeneratingRef.current) {
                  console.log('⏭️ Skipping: Diagram already generating (ref check)')
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:390',message:'Skipped duplicate - isDiagramGeneratingRef.current=true',data:{diagramCreationId,inProgressRequirements:diagramGenerationInProgressRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
                  continue
                }
                
                // #region agent log
                const requirementsHash = parsed.requirements ? parsed.requirements.substring(0, 50) + '_' + parsed.requirements.length : 'no_requirements';
                const isDuplicate = processedTriggerIds.current.has(requirementsHash);
                fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:365',message:'Checking processedTriggerIds for duplicate',data:{diagramCreationId,requirementsHash,isDuplicate,processedTriggerIdsSize:processedTriggerIds.current.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                // Check for duplicate using processedTriggerIds OR if any diagram is currently generating
                // Also check if a diagram with similar requirements was already processed (within last 30 seconds)
                const similarRequirementsHash = requirementsHash.substring(0, 100); // Use first 100 chars for similarity check
                const hasSimilarRequirements = Array.from(processedTriggerIds.current).some(hash => 
                  hash.substring(0, 100) === similarRequirementsHash
                );
                
                if (isDuplicate || hasSimilarRequirements || isDiagramGeneratingRef.current) {
                  console.log('⏭️ Skipping: Duplicate or similar diagram creation (already processed or in progress)')
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:408',message:'Skipped duplicate/similar - found in processedTriggerIds or in progress',data:{diagramCreationId,requirementsHash,similarRequirementsHash,isDuplicate,hasSimilarRequirements,isDiagramGeneratingRef:isDiagramGeneratingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                  // #endregion
                  continue
                }
                
                // Mark as processed IMMEDIATELY (before async state updates)
                processedTriggerIds.current.add(requirementsHash);
                isDiagramGeneratingRef.current = true;
                diagramGenerationInProgressRef.current = requirementsHash;
                
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:414',message:'Marked diagram generation in progress (ref)',data:{diagramCreationId,requirementsHash,isDiagramGeneratingRef:isDiagramGeneratingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                
                console.log('🚀 Agent decided to create diagram:', parsed.message)
                console.log('🔍 Requirements:', parsed.requirements)
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:378',message:'Processing diagram creation - before state update',data:{diagramCreationId,requirementsHash,isDiagramGeneratingBefore:isDiagramGenerating},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
                // Also add the message to the chat UI
                assistantMessage += `\n\n${parsed.message}`
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
                
                // Set loading state for diagram generation (ref already set above)
                setIsDiagramGenerating(true)
                console.log('🔄 Set diagram generation loading state to true')
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:438',message:'Frontend: Set isDiagramGenerating=true (state + ref)',data:{diagramCreationId,requirementsHash,isDiagramGeneratingRef:isDiagramGeneratingRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                
                // Set global state (needed for naming and other functions)
                ;(window as any).originalChatTextInput = parsed.requirements
                ;(window as any).chatTextInput = parsed.requirements
                ;(window as any).selectedImages = []
                console.log('✅ Set global state for diagram generation')
                
                // Call architecture agent to actually create the diagram
                // This respects the agent's decision - the chat agent decided to create, now we execute
                console.log('📞 Calling architecture agent (respecting chat agent decision)...')
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:430',message:'Frontend: About to call handleChatSubmit',data:{diagramCreationId,requirementsHash,requirements:parsed.requirements?.substring(0,100),requirementsFull:parsed.requirements},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                try {
                  const handleChatSubmit = (window as any).handleChatSubmit
                  if (handleChatSubmit && typeof handleChatSubmit === 'function') {
                    console.log('✅ Found handleChatSubmit function, calling it...')
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:437',message:'Frontend: Calling handleChatSubmit',data:{diagramCreationId,requirementsHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    await handleChatSubmit(parsed.requirements)
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:443',message:'Frontend: handleChatSubmit completed',data:{diagramCreationId,requirementsHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    console.log('✅ Architecture agent completed successfully')
                  } else {
                    console.error('❌ handleChatSubmit function not found on window object')
                    throw new Error('handleChatSubmit function not available')
                  }
                } catch (error) {
                  console.error('❌ Architecture generation failed:', error)
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/cc01c551-14ba-42f2-8fd9-8753b66b462f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:415',message:'handleChatSubmit error',data:{diagramCreationId,requirementsHash,error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
                } finally {
                  // Clear loading state after completion (both state and ref)
                  setIsDiagramGenerating(false)
                  isDiagramGeneratingRef.current = false;
                  diagramGenerationInProgressRef.current = null;
                  console.log('✅ Set diagram generation loading state to false')
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:490',message:'Diagram generation complete - cleared state and ref',data:{diagramCreationId,requirementsHash},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
                }
                continue // Continue processing other messages in the same chunk
              }
              
              // Handle question messages
              if (parsed.type === 'question') {
                console.log('❓ Question message received:', parsed)
                
                // Remove the streaming message and any diagram_creation messages that were just added
                // (if API sent both diagram_creation and question, we only want the question)
                setMessages(prev => {
                  // Filter out the streaming message and any recent diagram creation messages
                  const filtered = prev.filter(msg => {
                    // Keep the streaming message removal logic
                    if (msg.id === streamingMessage.id) return false
                    // Remove any assistant messages that contain "Creating architecture diagram" 
                    // that were just added (within last few seconds)
                    if (msg.role === 'assistant' && msg.content?.includes('Creating architecture diagram')) {
                      const msgTime = msg.timestamp.getTime()
                      const now = Date.now()
                      // Remove if added within last 5 seconds (likely from this same request)
                      if (now - msgTime < 5000) {
                        console.log('🗑️ Removing premature diagram creation message in favor of question')
                        return false
                      }
                    }
                    return true
                  })
                  
                  // Check if this exact question already exists (prevent duplicate questions)
                  const questionContent = parsed.question || '';
                  const duplicateQuestion = filtered.find(msg => 
                    msg.role === 'assistant' && 
                    (msg.type === 'radio-question' || msg.type === 'checkbox-question' || msg.type === 'question') &&
                    msg.content === questionContent
                  );
                  
                  if (duplicateQuestion) {
                    console.log('⚠️ Skipping duplicate question:', questionContent);
                    return filtered; // Don't add duplicate question
                  }
                  
                  const questionMessage: ChatMessage = {
                    id: `question-${Date.now()}-${Math.random().toString(36).substring(7)}`, // Ensure unique ID
                    role: 'assistant',
                    content: parsed.question || '',
                    timestamp: new Date(),
                    type: parsed.question_type as 'radio-question' | 'checkbox-question',
                    question: parsed.question,
                    options: parsed.options || []
                  }
                  return [...filtered, questionMessage]
                })
                
                // Also cancel any diagram generation that might have started
                if (isDiagramGenerating || isDiagramGeneratingRef.current) {
                  console.log('🛑 Cancelling diagram generation - question takes priority')
                  setIsDiagramGenerating(false)
                  isDiagramGeneratingRef.current = false;
                  diagramGenerationInProgressRef.current = null;
                }
                
                continue // Continue processing other messages in the same chunk
              }
              
              // Handle error messages
              if (parsed.type === 'error') {
                console.log('❌ Error message received:', parsed.message)
                assistantMessage += `\n\nError: ${parsed.message}`
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
                continue // Continue processing other messages in the same chunk
              }
              
              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content
                assistantMessage += content
                console.log('📝 Adding content:', content, 'Total:', assistantMessage)
                
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                )
              }
            } catch (e) {
              console.log('⚠️ Failed to parse chunk:', data, 'Error:', e)
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error calling OpenAI:', error)
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('📝 HandleSendMessage called with input:', inputValue)
    
    if (!inputValue.trim() || isLoading) {
      console.log('❌ Cannot send message - empty input or loading:', { inputValue, isLoading })
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
      images: pastedImages.length > 0 ? [...pastedImages] : undefined
    }

    console.log('💬 Adding user message:', userMessage)
    setMessages(prev => [...prev, userMessage])
    const messageText = inputValue.trim()
    setInputValue("")
    setPastedImages([]) // Clear pasted images after sending
    setIsLoading(true)

    console.log('🚀 Calling OpenAI with message:', messageText)
    console.log('📸 Images being sent:', pastedImages.length > 0 ? pastedImages.length : 'none')
    try {
      await callOpenAI(messageText, pastedImages.length > 0 ? pastedImages : undefined)
    } finally {
      console.log('🏁 OpenAI call completed')
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter alone submits, Shift+Enter creates new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e as any)
    }
    // Shift+Enter is allowed to pass through naturally for new lines
  }

  // Auto-resize textarea based on content
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px` // Max height ~6 lines
    }
  }, [inputValue])

  const getMessageIcon = (role: ChatMessage['role']) => {
    switch (role) {
      case 'user':
        return <User className="w-4 h-4" />
      case 'assistant':
        return <Bot className="w-4 h-4" />
      default:
        return <MessageSquare className="w-4 h-4" />
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Question block component matching the design
  const QuestionBlock: React.FC<{
    message: ChatMessage
    selectedOptions: Record<string, string | string[]>
    expandedQuestions: Record<string, boolean>
    onToggleExpanded: (id: string) => void
    onOptionChange: (id: string, value: string | string[], isMulti: boolean) => void
  }> = ({ message, selectedOptions, expandedQuestions, onOptionChange }) => {
    const isExpanded = expandedQuestions[message.id] !== false // Default to expanded
    const isMulti = message.type === 'checkbox-question'
    const questionText = message.question || message.content
    const currentSelections = selectedOptions[message.id]
    
    const getOptionLabel = (index: number) => {
      return String.fromCharCode(65 + index) // A, B, C, etc.
    }
    
    const isSelected = (optionId: string) => {
      if (isMulti) {
        return Array.isArray(currentSelections) && currentSelections.includes(optionId)
      }
      return currentSelections === optionId
    }
    
    const handleOptionClick = (optionId: string) => {
      if (isMulti) {
        const current = Array.isArray(currentSelections) ? currentSelections : []
        const newValue = current.includes(optionId)
          ? current.filter(v => v !== optionId)
          : [...current, optionId]
        onOptionChange(message.id, newValue, true)
      } else {
        onOptionChange(message.id, optionId, false)
      }
    }
    
    return (
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-gray-700" strokeWidth={2} />
            <h3 className="text-base font-semibold text-gray-900">Question</h3>
          </div>
        </div>
        
        {/* Question Content */}
        {isExpanded && message.options && (
          <div className="p-4 space-y-4">
            <h4 className="text-base font-semibold text-gray-900">
              {questionText}
            </h4>
            
            <div className="space-y-2">
              {message.options.map((option, index) => {
                const selected = isSelected(option.id)
                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option.id)}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                      selected 
                        ? "bg-white border-2" 
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    )}
                    style={selected ? { borderColor: BLUE_HEX } : undefined}
                  >
                    <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 mt-0.5">
                      <div 
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          selected ? "" : "border-gray-300"
                        )}
                        style={selected ? { borderColor: BLUE_HEX, backgroundColor: BLUE_HEX } : undefined}
                      >
                        {selected && (
                          <div className="w-2 h-2 rounded bg-white" />
                        )}
                      </div>
                    </div>
                    <span className="flex-1 text-sm text-gray-900">
                      <span className="font-medium mr-2">{getOptionLabel(index)}.</span>
                      {option.text}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      className={cn(`
        relative h-full bg-gray-50 text-gray-700 border-l border-gray-200 transition-all duration-300 ease-in-out flex-shrink-0
        ${isCollapsed ? 'w-18 min-w-18' : 'w-96 min-w-96'}
      `, className)}
      style={{ width: isCollapsed ? '4.5rem' : '24rem', zIndex: 10005, pointerEvents: 'auto' }}
      data-chatbox="true"
    >
      
      {/* Agent Icon - Always visible, fixed position */}
      {config.showAgentIcon && (
        <div className="absolute top-4 right-4 z-50">
          <div className="relative group" data-testid="agent-icon">
            <div className="w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200">
              <Cpu className="w-4 h-4" />
            </div>
            {/* Hover overlay - show expand icon when collapsed, collapse icon when expanded */}
            <button 
              onClick={onToggleCollapse}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-200 shadow-lg"
              title={isCollapsed ? "Open Chat Panel" : "Close Chat Panel"}
            >
              {isCollapsed ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Icon Layout - Always Visible */}
      <div className="flex flex-col h-full pt-20">
        {/* Divider */}
        {!isCollapsed && (
          <div className="mx-4 my-4 border-t border-gray-300"></div>
        )}

        {/* Chat Content - Only when expanded */}
        {!isCollapsed && (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 mt-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <Cpu className="w-8 h-8 text-gray-300" />
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex gap-3",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role !== 'user' && (
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                          {getMessageIcon(message.role)}
                        </div>
                      )}
                      
                      {/* Render question type messages differently */}
                      {message.type === 'radio-question' || message.type === 'checkbox-question' ? (
                        <div className="w-full max-w-full">
                          <QuestionBlock 
                            message={message}
                            selectedOptions={selectedOptions}
                            expandedQuestions={expandedQuestions}
                            onToggleExpanded={(id) => setExpandedQuestions(prev => ({ ...prev, [id]: !prev[id] }))}
                            onOptionChange={(id, value, isMulti) => {
                              setSelectedOptions(prev => {
                                const newOptions = {
                                  ...prev,
                                  [id]: isMulti ? (prev[id] as string[] || []).includes(value as string)
                                    ? (prev[id] as string[] || []).filter(v => v !== value)
                                    : [...(prev[id] as string[] || []), value as string]
                                    : value
                                };
                                
                                // Auto-trigger after selection (works for both radio and checkbox)
                                // Use a unique key to prevent duplicate triggers
                                const triggerKey = `${id}_${JSON.stringify(newOptions[id])}`;
                                
                                // Check if this trigger is already pending or API call already queued (check all refs)
                                if (pendingAutoTriggers.current.has(triggerKey) || pendingAutoTriggerRef.current.has(triggerKey) || apiCallQueuedRef.current.has(triggerKey)) {
                                  // #region agent log
                                  fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:850',message:'Skipping duplicate auto-trigger',data:{triggerKey,questionId:id,pendingAutoTriggers:pendingAutoTriggers.current.has(triggerKey),pendingAutoTriggerRef:pendingAutoTriggerRef.current.has(triggerKey),apiCallQueued:apiCallQueuedRef.current.has(triggerKey)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                  // #endregion
                                  return newOptions;
                                }
                                
                                // Mark as pending in ALL refs (defense in depth)
                                pendingAutoTriggers.current.add(triggerKey);
                                pendingAutoTriggerRef.current.add(triggerKey);
                                apiCallQueuedRef.current.add(triggerKey); // Mark that setTimeout is about to be queued
                                
                                setTimeout(() => {
                                  // CRITICAL: Check if this triggerKey is already being processed by another setTimeout callback
                                  // Use a separate ref to track which callbacks are actively processing
                                  if (apiCallProcessingRef.current.has(triggerKey)) {
                                    // Another setTimeout callback is already processing this, skip this one
                                    // #region agent log
                                    fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:863',message:'Skipping - API call already processing in another setTimeout',data:{triggerKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                    // #endregion
                                    // Clean up pending refs
                                    pendingAutoTriggers.current.delete(triggerKey);
                                    pendingAutoTriggerRef.current.delete(triggerKey);
                                    apiCallQueuedRef.current.delete(triggerKey);
                                    return;
                                  }
                                  
                                  // Mark as processing and clear the "queued" flag
                                  apiCallProcessingRef.current.add(triggerKey);
                                  apiCallQueuedRef.current.delete(triggerKey);
                                  
                                  const selectedValues = newOptions[id];
                                  if (selectedValues && (Array.isArray(selectedValues) ? selectedValues.length > 0 : selectedValues)) {
                                    try {
                                      // Get the option text for the selected value(s)
                                      const optionTexts = Array.isArray(selectedValues) 
                                        ? selectedValues.map((optId: string) => message.options?.find(o => o.id === optId)?.text).filter(Boolean)
                                        : [message.options?.find(o => o.id === selectedValues)?.text].filter(Boolean);
                                      
                                      if (optionTexts.length > 0) {
                                        // Send the selected options to get next question or create diagram
                                        const selectionMessage = `Selected: ${optionTexts.join(', ')}`;
                                        console.log('🔄 Auto-triggering with selection:', selectionMessage);
                                        
                                        // #region agent log - Log BEFORE adding answer to messages
                                        const messagesBeforeAnswer = messages;
                                        const questionCountBefore = messagesBeforeAnswer.filter(m => m.type === 'radio-question' || m.type === 'checkbox-question').length;
                                        const answerCountBefore = messagesBeforeAnswer.filter(m => m.role === 'user' && m.content?.toLowerCase().startsWith('selected:')).length;
                                        fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:877',message:'BEFORE answer: messages state',data:{messagesCount:messagesBeforeAnswer.length,questionCount:questionCountBefore,answerCount:answerCountBefore,messages:messagesBeforeAnswer.map(m=>({role:m.role,type:m.type,content:m.content?.substring(0,50),id:m.id})),selectionMessage,questionId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                                        // #endregion
                                        
                                        // CRITICAL FIX: Add answer to messages FIRST, then call API OUTSIDE callback
                                        // The setMessages callback may execute multiple times - check for duplicate before adding
                                        setMessages(prev => {
                                          // Check if this answer was already added (prevent duplicate from strict mode)
                                          const lastMessage = prev[prev.length - 1];
                                          if (lastMessage?.role === 'user' && lastMessage.content === selectionMessage) {
                                            // #region agent log
                                            fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:912',message:'Skipping duplicate answer message',data:{selectionMessage,lastMessageContent:lastMessage.content},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                            // #endregion
                                            return prev; // Don't add duplicate
                                          }
                                          
                                          const answerMessage: ChatMessage = {
                                            id: `answer-${Date.now()}-${Math.random().toString(36).substring(7)}`, // Ensure unique ID
                                            role: 'user',
                                            content: selectionMessage,
                                            timestamp: new Date()
                                          };
                                          const messagesWithAnswer = [...prev, answerMessage];
                                          
                                          // Immediately sync messagesRef for the inner setTimeout to read
                                          messagesRef.current = messagesWithAnswer;
                                          
                                          // #region agent log - Log AFTER adding answer to messages
                                          const questionCountAfter = messagesWithAnswer.filter(m => m.type === 'radio-question' || m.type === 'checkbox-question').length;
                                          const answerCountAfter = messagesWithAnswer.filter(m => m.role === 'user' && m.content?.toLowerCase().startsWith('selected:')).length;
                                          fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:923',message:'AFTER adding answer: messages state',data:{messagesCount:messagesWithAnswer.length,questionCount:questionCountAfter,answerCount:answerCountAfter,lastMessage:{role:answerMessage.role,content:answerMessage.content,id:answerMessage.id}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                                          // #endregion
                                          
                                          return messagesWithAnswer;
                                        });
                                        
                                        // Call API OUTSIDE of setMessages callback to prevent multiple invocations
                                        // Use setTimeout(0) to ensure state update completes first, then use messagesRef
                                        setTimeout(() => {
                                          // CRITICAL: Check if API call already made for this triggerKey
                                          // This prevents duplicate calls even if this setTimeout fires multiple times
                                          if (apiCallMadeRef.current.has(triggerKey)) {
                                            // #region agent log
                                            fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:932',message:'Skipping - API call already made for this triggerKey',data:{triggerKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                                            // #endregion
                                            return;
                                          }
                                          
                                          // Mark as made BEFORE calling API to prevent race conditions
                                          apiCallMadeRef.current.add(triggerKey);
                                          
                                          // Use messagesRef instead of setMessages callback to avoid double execution
                                          const currentMessages = messagesRef.current;
                                          
                                          // #region agent log
                                          fetch('http://127.0.0.1:7243/ingest/2c91d607-2790-4bbf-a7ab-0b4d8e1cfe86',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RightPanelChat.tsx:945',message:'Question answer auto-triggering new API call',data:{selectionMessage,questionId:id,isDiagramGenerating,triggerKey,messagesCount:currentMessages.length,hasSelectionMessage:currentMessages.some(m=>m.content===selectionMessage)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                                          // #endregion
                                          
                                          callOpenAI(selectionMessage, [], currentMessages);
                                          
                                          // Clean up ALL refs after API call
                                          pendingAutoTriggers.current.delete(triggerKey);
                                          pendingAutoTriggerRef.current.delete(triggerKey);
                                          apiCallQueuedRef.current.delete(triggerKey);
                                          apiCallProcessingRef.current.delete(triggerKey);
                                          
                                          // Clean up apiCallMadeRef after a delay (allow for next question cycle)
                                          setTimeout(() => {
                                            apiCallMadeRef.current.delete(triggerKey);
                                          }, 5000);
                                        }, 0);
                                      } else {
                                        // Remove immediately if no valid selection
                                        pendingAutoTriggers.current.delete(triggerKey);
                                        pendingAutoTriggerRef.current.delete(triggerKey);
                                        apiCallQueuedRef.current.delete(triggerKey);
                                        apiCallProcessingRef.current.delete(triggerKey);
                                      }
                                    } catch (error) {
                                      console.error('❌ Error in auto-trigger:', error);
                                      // Remove on error - clean up all refs
                                      pendingAutoTriggers.current.delete(triggerKey);
                                      pendingAutoTriggerRef.current.delete(triggerKey);
                                      apiCallQueuedRef.current.delete(triggerKey);
                                      apiCallProcessingRef.current.delete(triggerKey);
                                    }
                                  } else {
                                    // Remove if no selection - clean up all refs
                                    pendingAutoTriggers.current.delete(triggerKey);
                                    pendingAutoTriggerRef.current.delete(triggerKey);
                                    apiCallQueuedRef.current.delete(triggerKey);
                                    apiCallProcessingRef.current.delete(triggerKey);
                                  }
                                }, 300);
                                
                                return newOptions;
                              });
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-3/4 rounded-lg px-3 py-2 shadow-sm",
                            message.role === 'user'
                              ? "bg-gray-900 text-white"
                              : "bg-white border border-gray-200 text-gray-900"
                          )}
                        >
                          {message.role === 'assistant' ? (
                            <div className="text-sm prose prose-sm max-w-none prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-gray-500">
                              <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                              {message.images && message.images.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {message.images.map((dataUrl, index) => (
                                    <img
                                      key={index}
                                      src={dataUrl}
                                      alt={`Attached image ${index + 1}`}
                                      className="w-20 h-20 object-cover rounded border border-gray-300"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {message.isStreaming && (
                            <div className="flex items-center gap-1 mt-1">
                              <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></div>
                              <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          )}
                          <p className={cn(
                            "text-xs mt-1",
                            message.role === 'user' ? "text-gray-300" : "text-gray-500"
                          )}>
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                      )}

                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                          {getMessageIcon(message.role)}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {isDiagramGenerating && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-sm text-gray-500">Generating architecture...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Image previews */}
            {pastedImages.length > 0 && (
              <div className="mx-4 mt-4">
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-600 w-full mb-2">
                    {pastedImages.length} image{pastedImages.length > 1 ? 's' : ''} attached:
                  </span>
                  {pastedImages.map((dataUrl, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={dataUrl}
                        alt={`Pasted image ${index + 1}`}
                        className="w-16 h-16 object-cover rounded border border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"        
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="mx-4 mt-4 border-t border-gray-300 pt-4 pb-4">
              <form onSubmit={handleSendMessage} className="flex items-center gap-3 bg-white rounded-lg border border-gray-300 shadow-sm p-3 hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-gray-400 focus-within:border-gray-400">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  data-testid="chat-input"
                  placeholder="Ask me to create an architecture..."
                  disabled={isLoading || isDiagramGenerating}
                  rows={1}
                  className={cn(
                    "flex-1 border-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none bg-transparent text-sm placeholder:text-gray-400 resize-none overflow-hidden",
                    "min-h-[2rem] max-h-[7.5rem] px-3 py-2 leading-5"
                  )}
                  style={{ 
                    height: 'auto',
                    maxHeight: '120px',
                    overflowY: 'auto'
                  }}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading || isDiagramGenerating}
                  className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-all duration-200 ${
                    !inputValue.trim() || isLoading || isDiagramGenerating
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-900 hover:bg-gray-800 text-white shadow-sm hover:shadow-md'
                  }`}
                  data-testid="send-button"
                  title={isLoading ? "Sending..." : isDiagramGenerating ? "Generating architecture..." : "Send message"}
                >
                  {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default RightPanelChat