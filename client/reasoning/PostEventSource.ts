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
      console.log('🔄 Attempting POST request to /stream...');
      
      // Use JSON format for cleaner API
      const requestBody = JSON.stringify({
        payload: payload,
        ...(prevId && { previous_response_id: prevId })
      });
      
      console.log('📦 POST body format: JSON, length:', requestBody.length);
      
      const response = await fetch('/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: requestBody,
        signal: controller.signal,
      });
      
      console.log(`📡 POST response status: ${response.status} ${response.statusText}`);
      console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Check if response is actually SSE
      const responseContentType = response.headers.get('content-type');
      if (!responseContentType?.includes('text/event-stream')) {
        console.warn(`⚠️ Unexpected content-type: ${responseContentType}`);
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
          console.log(`📡 Stream ended after ${messageCount} messages`);
          source.readyState = 2; // CLOSED
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        console.log(`📡 Raw chunk received (${chunk.length} chars):`, chunk.substring(0, 200) + '...');
        buffer += chunk;
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue; // Skip empty lines
          
          console.log(`📡 Processing line: "${line}"`);
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              console.log('📡 Received [DONE] marker');
              continue;
            }
            
            messageCount++;
            console.log(`📨 Received message ${messageCount}:`, data.substring(0, 100) + '...');
            
            // Dispatch message event
            const messageEvent = new MessageEvent('message', { data });
            source.dispatchEvent(messageEvent);
            if (source.onmessage) source.onmessage.call(source as any, messageEvent);
          } else if (line.startsWith('event: ') || line.startsWith('id: ') || line.startsWith('retry: ')) {
            console.log(`📡 SSE metadata: ${line}`);
          } else {
            console.log(`📡 Unexpected line format: "${line}"`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ POST EventSource error:', error);
      source.readyState = 2; // CLOSED
      
      // Don't treat AbortError as a real error - it's expected when we close the stream
      if (error.name === 'AbortError') {
        console.log('📡 Stream closed normally (AbortError expected)');
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
  console.log(`🔄 Falling back to GET request, URL length: ${url.length}`);
  return new EventSource(url);
}; 