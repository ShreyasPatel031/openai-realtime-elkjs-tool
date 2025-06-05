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
export const createPostEventSource = (payload: string, prevId?: string): PostEventSource => {
  const controller = new AbortController();
  
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
  
  // Add close method
  source.close = () => {
    source.readyState = 2; // CLOSED
    controller.abort();
  };
  
  // Start the fetch request
  const startFetch = async () => {
    try {
      // Use JSON format for cleaner API
      const requestBody = JSON.stringify({
        payload: payload,
        ...(prevId && { previous_response_id: prevId })
      });
      
      console.log('🔄 Starting stream...', prevId ? '(follow-up)' : '(initial)');
      
      const response = await fetch('/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: requestBody,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      source.readyState = 1; // OPEN
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
        const { done, value } = await reader.read();
        
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
            
            // Only log function calls and important events, not every message
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'response.function_call_delta' && parsed.delta?.name) {
                console.log(`🔧 Function call: ${parsed.delta.name}`);
              } else if (parsed.type === 'response.done') {
                console.log('✅ Response completed');
              } else if (parsed.type === 'error') {
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
      source.readyState = 2; // CLOSED
      
      // Don't treat AbortError as a real error - it's expected when we close the stream
      if (error.name === 'AbortError') {
        return; // Don't dispatch error event for normal closure
      }
      
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
    url += `&previous_response_id=${encodeURIComponent(prevId)}`;
  }
  console.log(`🔄 Using GET fallback (${url.length} chars)`);
  return new EventSource(url);
}; 