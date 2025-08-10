// Custom EventSource-like interface for POST + SSE
export interface PostEventSource extends EventTarget {
  readyState: number;
  url: string;
  withCredentials: boolean;
  close(): void;
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null;
  onerror: ((this: EventSource, ev: Event) => any) | null;
  onopen: ((this: EventSource, ev: Event) => any) | null;
  CONNECTING: number;
  OPEN: number;
  CLOSED: number;
}



// Helper to create EventSource-like object using POST + SSE parsing
export const createPostEventSource = (payload: string | FormData, prevId?: string, apiEndpoint?: string): PostEventSource => {
  const controller = new AbortController();
  
  // Use response ID for proper GPT-5 tool output chaining
  if (prevId) {
    console.log(`🔍 PostEventSource: Using response ID ${prevId} for GPT-5 tool chaining`);
  }
  
  // Create EventSource-like object
  const source = new EventTarget() as PostEventSource;
  source.readyState = 0; // CONNECTING
  source.url = '/stream';
  source.withCredentials = false;
  source.onmessage = null;
  source.onerror = null;
  source.onopen = null;
  source.CONNECTING = 0;
  source.OPEN = 1;
  source.CLOSED = 2;
  
  // Reconnection state
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;
  const reconnectDelay = 2000; // 2 seconds
  // No timeout - let O3 model take as long as it needs
  
  // Add close method
  source.close = () => {
    source.readyState = 2; // CLOSED
    controller.abort();
  };
  
      // Start the fetch request
  const startFetch = async () => {
    const requestStart = performance.now();
        console.log(`⏱️ REQUEST TIMING: Starting fetch`);
    
    try {
      let requestBody: string | FormData;
      let headers: Record<string, string> = {
        'Accept': 'text/event-stream',
      };
      
      // Handle FormData (images) vs JSON payload
        if (payload instanceof FormData) {
          console.log('🔄 Starting stream with FormData', prevId ? '(follow-up)' : '(initial)');
        
        // Include response ID for tool chaining when provided
        if (prevId) {
          console.log(`🔍 PostEventSource: Including FormData response ID for tool chaining: ${prevId}`);
          payload.append('previous_response_id', prevId);
        }
        
        requestBody = payload;
        // Don't set Content-Type header for FormData - let browser set it with boundary
        } else {
          console.log('🔄 Starting stream with JSON', prevId ? '(follow-up)' : '(initial)');
        
        // Use payload directly without compression
        const compressedPayload = payload;
        
        // Use JSON format for cleaner API
        const body: any = {
          payload: compressedPayload,
          isCompressed: false
        };
        // Include previous_response_id when provided (follow-up tool output)
        if (prevId) {
          body.previous_response_id = prevId;
        }
        requestBody = JSON.stringify(body);
        
        headers['Content-Type'] = 'application/json';
        // No compression headers since we disabled compression
        
         // no extra payload size logging
      }
      
      const payloadPrepTime = performance.now();
      console.log(`⏱️ REQUEST TIMING: Payload preparation took ${(payloadPrepTime - requestStart).toFixed(2)}ms`);
      
      // Generate a unique session ID for tracking (commented out due to CORS restrictions)
      // const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // headers['x-session-id'] = sessionId;
      
              // Use provided apiEndpoint or default to relative URL
        console.log(`🔍 DEBUG: apiEndpoint parameter:`, apiEndpoint);
        let apiUrl = apiEndpoint ? `${apiEndpoint}/api/stream` : '/api/stream';
        
        console.log(`🌐 PostEventSource making request to: ${apiUrl}`);
        
        // Debug tap 1: Log the exact JSON request that goes to /api/stream
        if ((window as any).__LLM_DEBUG__) {
          console.log(
            "%c🛰️  ► outbound payload",
            "color:#0af",
            JSON.parse(JSON.stringify(typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody))          // deep-clone for readability
          );
        }
        
        console.log(`⏱️ REQUEST TIMING: Starting network fetch`);
        
        // No timeout - let O3 model take as long as it needs
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal,
        }) as Response;
      
      console.log(`⏱️ REQUEST TIMING: Network response received`);
      console.log('🔍 Stream response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
          console.error('❌ Stream endpoint failed:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      // Check if we're getting the expected content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream') && !contentType?.includes('text/plain')) {
        const responseText = await response.text();
        console.error('❌ Unexpected content-type from /stream:', contentType);
        console.error('❌ Response body:', responseText.substring(0, 200) + '...');
        throw new Error(`Expected event-stream but got ${contentType}: ${responseText}`);
      }
      
      source.readyState = 1; // OPEN
      
      // Reset reconnection attempts on successful connection
      reconnectAttempts = 0;
      
      const openEvent = new Event('open');
      source.dispatchEvent(openEvent);
      if (source.onopen) source.onopen.call(source as any, openEvent);
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      let messageCount = 0;
      
      // Read the stream
      while (true) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (readError) {
          // Handle read errors gracefully
          console.error('❌ Stream read error:', readError.message || readError);
          
          // Handle AbortError
          if (readError.name === 'AbortError') {
            console.log('📡 Stream aborted normally');
            source.readyState = 2; // CLOSED
            break;
          }
          
          // Handle BodyStreamBuffer errors (common with Vercel dev server)
          if (readError.message && readError.message.includes('BodyStreamBuffer was aborted')) {
            console.log('📡 BodyStreamBuffer aborted - treating as normal closure');
            source.readyState = 2; // CLOSED
            break;
          }
          
          // Handle TypeError for stream reading
          if (readError.name === 'TypeError' && readError.message.includes('stream')) {
            console.log('📡 Stream TypeError - treating as normal closure');
            source.readyState = 2; // CLOSED
            break;
          }
          
          throw readError; // Re-throw other errors
        }
        
        const { done, value } = readResult;
        
        if (done) {
          console.log(`📡 Stream ended (${messageCount} messages)`);
          source.readyState = 2; // CLOSED
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        // Removed verbose chunk logging - was causing token spam
        buffer += chunk;
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue; // Skip empty lines
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
          // minimal
              continue;
            }
            
            messageCount++;
            
            // Log only errors
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'error') {
                console.log('❌ Error:', parsed.error?.message || 'Unknown error');
              }
            } catch (e) {
              // Not JSON or not important, skip logging
            }
            
            // Dispatch message event
            const messageEvent = new MessageEvent('message', { data });
            source.dispatchEvent(messageEvent);
            if (source.onmessage) source.onmessage.call(source as any, messageEvent);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Stream error:', error.message || error);
      console.error('❌ Stream error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      source.readyState = 2; // CLOSED
      
      // Handle different error types
      if (error.name === 'AbortError') {
        console.log('📡 Stream aborted normally');
        return; // Don't dispatch error event for normal closure
      }
      
      // Handle socket timeout errors with automatic reconnection
      if (error.message && error.message.includes('Socket timeout')) {
        console.warn('⚠️ Socket timeout - this may be due to slow O3 model processing');
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectDelay}ms...`);
          
          setTimeout(() => {
            source.readyState = 0; // CONNECTING
            startFetch(); // Retry the connection
          }, reconnectDelay);
          return;
        }
        
        console.warn('⚠️ Max reconnection attempts reached for socket timeout');
        
        // Dispatch a more user-friendly error
        const errorEvent = new Event('error');
        (errorEvent as any).error = {
          ...error,
          message: 'Request timed out after multiple attempts. The O3 model may need more time to process complex requests.',
          type: 'socket_timeout'
        };
        source.dispatchEvent(errorEvent);
        if (source.onerror) source.onerror.call(source as any, errorEvent);
        return;
      }

      // Handle premature close errors with automatic reconnection
      if (error.message && error.message.includes('Premature close')) {
        console.warn('⚠️ Stream closed prematurely - this may be due to server issues or network problems');
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectDelay}ms...`);
          
          setTimeout(() => {
            source.readyState = 0; // CONNECTING
            startFetch(); // Retry the connection
          }, reconnectDelay);
          return;
        }
        
        console.warn('⚠️ Max reconnection attempts reached for premature close');
        
        // Dispatch a more user-friendly error
        const errorEvent = new Event('error');
        (errorEvent as any).error = {
          ...error,
          message: 'Stream connection closed unexpectedly after multiple attempts. Please try again.',
          type: 'premature_close'
        };
        source.dispatchEvent(errorEvent);
        if (source.onerror) source.onerror.call(source as any, errorEvent);
        return;
      }
      
      // Handle network errors
      if (error.name === 'NetworkError' || error.message.includes('fetch')) {
        console.error('❌ Network error - check internet connection');
        const errorEvent = new Event('error');
        (errorEvent as any).error = {
          ...error,
          message: 'Network error. Please check your internet connection and try again.',
          type: 'network_error'
        };
        source.dispatchEvent(errorEvent);
        if (source.onerror) source.onerror.call(source as any, errorEvent);
        return;
      }
      
      // Default error handling
      const errorEvent = new Event('error');
      (errorEvent as any).error = error;
      source.dispatchEvent(errorEvent);
      if (source.onerror) source.onerror.call(source as any, errorEvent);
    }
  };
  
  // Start the fetch
  startFetch();
  
  return source;
};

 