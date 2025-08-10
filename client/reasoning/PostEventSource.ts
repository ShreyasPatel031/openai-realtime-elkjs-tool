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
    const startTime = new Date().toISOString();
    
    try {
      let requestBody: string | FormData;
      let headers: Record<string, string> = {
        'Accept': 'text/event-stream',
      };
      
      // Handle FormData (images) vs JSON payload
        if (payload instanceof FormData) {

        
        // Include response ID for tool chaining when provided
        if (prevId) {

          payload.append('previous_response_id', prevId);
        }
        
        requestBody = payload;
        // Don't set Content-Type header for FormData - let browser set it with boundary
        } else {

        
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
      const payloadTime = payloadPrepTime - requestStart;
      
      // Generate a unique session ID for tracking (commented out due to CORS restrictions)
      // const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // headers['x-session-id'] = sessionId;
      
              // Use provided apiEndpoint or default to relative URL

        let apiUrl = apiEndpoint ? `${apiEndpoint}/api/stream` : '/api/stream';
        

        
        // Debug tap 1: Log the exact JSON request that goes to /api/stream
        if ((window as any).__LLM_DEBUG__) {
          console.log(
            "%c🛰️  ► outbound payload",
            "color:#0af",
            JSON.parse(JSON.stringify(typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody))          // deep-clone for readability
          );
        }
        
  
        
        // No timeout - let O3 model take as long as it needs
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal,
        }) as Response;
      


      
            if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Stream endpoint failed:', response.status, errorText);
        
        // Check if this is a "previous response not found" error
        if (response.status === 500 && errorText.includes('Previous response with id') && errorText.includes('not found')) {
          // Extract the expired response ID for logging
          const match = errorText.match(/Previous response with id '([^']+)' not found/);
          // Throw a specific error type that we can catch and handle
          const expiredError = new Error(`EXPIRED_RESPONSE_ID: ${errorText}`);
          expiredError.name = 'ExpiredResponseError';
          throw expiredError;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      const responseTime = performance.now();
      const serverResponseTime = responseTime - requestStart;
      
      if (serverResponseTime > 5000) {
        console.warn(`⚠️ SLOW RESPONSE: Server took ${(serverResponseTime / 1000).toFixed(1)}s to respond - this may cause timeouts`);
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
          const streamTime = performance.now() - requestStart;
          
          // Log BodyStreamBuffer aborts with reduced severity since they're expected in dev
          if (readError.message && readError.message.includes('BodyStreamBuffer was aborted')) {

          } else {
            console.error('❌ Stream read error:', readError.message || readError);
          }
          
          // Handle AbortError
          if (readError.name === 'AbortError') {
    
            source.readyState = 2; // CLOSED
            break;
          }
          
          // Handle BodyStreamBuffer errors (common with Vercel dev server)
          if (readError.message && readError.message.includes('BodyStreamBuffer was aborted')) {
            source.readyState = 2; // CLOSED
            
            // Send a synthetic completion event to ensure UI is cleaned up properly
            setTimeout(() => {
              try {
                const syntheticDoneEvent = new MessageEvent('message', {
                  data: '[DONE]'
                });
                source.dispatchEvent(syntheticDoneEvent);
                if (source.onmessage) source.onmessage.call(source as any, syntheticDoneEvent);
              } catch (e) {
                // Ignore synthetic event dispatch errors
              }
            }, 100);
            break;
          }
          
          // Handle TypeError for stream reading
          if (readError.name === 'TypeError' && readError.message.includes('stream')) {
            source.readyState = 2; // CLOSED
            
            // Send a synthetic completion event to ensure UI is cleaned up properly
            setTimeout(() => {
              try {
                const syntheticDoneEvent = new MessageEvent('message', {
                  data: '[DONE]'
                });
                source.dispatchEvent(syntheticDoneEvent);
                if (source.onmessage) source.onmessage.call(source as any, syntheticDoneEvent);
              } catch (e) {
                // Ignore synthetic event dispatch errors
              }
            }, 100);
            break;
          }
          
          throw readError; // Re-throw other errors
        }
        
        const { done, value } = readResult;
        
        if (done) {
          const streamEndTime = performance.now();
          const totalStreamTime = streamEndTime - requestStart;

          source.readyState = 2; // CLOSED
          
          // Check if we received a proper [DONE] event during the stream
          const receivedDoneEvent = (source as any)._receivedDoneEvent;
          if (!receivedDoneEvent) {
            // Send a synthetic completion event to ensure UI is cleaned up properly
            setTimeout(() => {
              try {
                const syntheticDoneEvent = new MessageEvent('message', {
                  data: '[DONE]'
                });
                source.dispatchEvent(syntheticDoneEvent);
                if (source.onmessage) source.onmessage.call(source as any, syntheticDoneEvent);
              } catch (e) {
                // Ignore synthetic event dispatch errors
              }
            }, 100);
          }
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
              // Track that we received a [DONE] event
              (source as any)._receivedDoneEvent = true;
              // Forward the [DONE] marker so consumers can finalize correctly
              const doneEvent = new MessageEvent('message', { data: '[DONE]' });
              source.dispatchEvent(doneEvent);
              if (source.onmessage) source.onmessage.call(source as any, doneEvent);
              continue;
            }
            
            messageCount++;
            
            // Only attempt to parse JSON payloads; [DONE] already handled above
            if (data && data.charAt(0) === '{') {
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'error') {
                  console.log('❌ Error:', parsed.error?.message || 'Unknown error');
                }
              } catch (e) {
                // ignore non-JSON lines
              }
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

        return; // Don't dispatch error event for normal closure
      }
      
      // Handle BodyStreamBuffer abort errors that might be caught here
      if (error.message && error.message.includes('BodyStreamBuffer was aborted')) {

        // Send synthetic completion to ensure UI cleanup
        setTimeout(() => {
          try {

            const syntheticDoneEvent = new MessageEvent('message', {
              data: '[DONE]'
            });
            source.dispatchEvent(syntheticDoneEvent);
            if (source.onmessage) source.onmessage.call(source as any, syntheticDoneEvent);

          } catch (e) {

          }
        }, 100);
        return; // Don't dispatch error event for handled abort
      }
      
      // Handle socket timeout errors with automatic reconnection
      if (error.message && error.message.includes('Socket timeout')) {
        console.warn('⚠️ Socket timeout - this may be due to slow O3 model processing');
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;

          
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

 