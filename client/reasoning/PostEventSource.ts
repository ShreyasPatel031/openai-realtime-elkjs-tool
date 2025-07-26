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

// Helper to compress payload using base64 to reduce size
const compressPayload = async (payload: string): Promise<string> => {
  // Use TextEncoder to convert string to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  
  // Create a buffer to hold compressed data
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(data);
  await writer.close();
  
  // Get the compressed data from the stream
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks and convert to base64
  const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  
  return btoa(String.fromCharCode(...compressed));
};

// Helper to create EventSource-like object using POST + SSE parsing
export const createPostEventSource = (payload: string | FormData, prevId?: string): PostEventSource => {
  const controller = new AbortController();
  
  // NEVER use responseId in multi-server scenarios - always start fresh
  // This prevents 404 errors when multiple servers are running on different ports
  if (prevId) {
    console.log(`🔍 PostEventSource: Ignoring response ID ${prevId} for multi-server compatibility`);
  }
  const actualPrevId = undefined; // Force fresh conversation for multi-server compatibility
  
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
    try {
      let requestBody: string | FormData;
      let headers: Record<string, string> = {
        'Accept': 'text/event-stream',
      };
      
      // Handle FormData (images) vs JSON payload
      if (payload instanceof FormData) {
        console.log('🔄 Starting stream with FormData (images)...', actualPrevId ? '(follow-up)' : '(initial)');
        
        // NEVER use response IDs for multi-server compatibility
        if (actualPrevId) {
          console.log(`🔍 PostEventSource: Blocking FormData response ID for multi-server compatibility: ${actualPrevId}`);
        }
        
        requestBody = payload;
        // Don't set Content-Type header for FormData - let browser set it with boundary
      } else {
        console.log('🔄 Starting stream with JSON...', actualPrevId ? '(follow-up)' : '(initial)');
        
        // Check if payload needs compression (over 40KB)
        const isLargePayload = payload.length > 40 * 1024;
        console.log('🔍 Payload size check:', payload.length, 'bytes, needs compression:', isLargePayload);
        
        // Skip compression due to browser CompressionStream hanging issues
        console.log('🔄 Skipping compression due to browser compatibility issues');
        const compressedPayload = payload;
        
        // Use JSON format for cleaner API
        requestBody = JSON.stringify({
          payload: compressedPayload,
          isCompressed: false // Always false since we disabled compression
          // NEVER include previous_response_id for multi-server compatibility
        });
        
        headers['Content-Type'] = 'application/json';
        // No compression headers since we disabled compression
        
        console.log('🔍 Original payload size:', payload.length);
        console.log('🔍 Sending uncompressed payload to avoid browser hanging issues');
      }
      
      // Generate a unique session ID for tracking
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      headers['x-session-id'] = sessionId;
      
              // No timeout - let O3 model take as long as it needs
        const response = await fetch('/api/stream', {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal,
        }) as Response;
      
      console.log('🔍 Stream response status:', response.status);
      console.log('🔍 Stream response headers:', Object.fromEntries(response.headers));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Stream endpoint failed:', response.status, errorText);
        console.error('❌ Full error response:', errorText);
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
          if (readError.name === 'AbortError') {
            console.log('📡 Stream aborted normally');
            source.readyState = 2; // CLOSED
            break;
          }
          throw readError; // Re-throw non-abort errors
        }
        
        const { done, value } = readResult;
        
        if (done) {
          console.log(`📡 Stream ended (${messageCount} messages)`);
          source.readyState = 2; // CLOSED
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue; // Skip empty lines
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('📡 [DONE] marker received');
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

// Fallback to GET with smaller payload
export const createGetEventSource = (payload: string, prevId?: string): EventSource => {
  let url = `/stream?payload=${encodeURIComponent(payload)}`;
  if (prevId) {
            // NEVER use response IDs for multi-server compatibility - this line removed
        console.log(`🔍 PostEventSource: Blocking response ID from URL for multi-server compatibility: ${prevId}`);
  }
  console.log(`🔄 Using GET fallback (${url.length} chars)`);
  return new EventSource(url);
}; 