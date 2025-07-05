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
      let requestBody: string | FormData;
      let headers: Record<string, string> = {
        'Accept': 'text/event-stream',
      };
      
      // Handle FormData (images) vs JSON payload
      if (payload instanceof FormData) {
        console.log('🔄 Starting stream with FormData (images)...', prevId ? '(follow-up)' : '(initial)');
        
        // Add prevId to FormData if provided
        if (prevId) {
          payload.append('previous_response_id', prevId);
        }
        
        requestBody = payload;
        // Don't set Content-Type header for FormData - let browser set it with boundary
      } else {
        console.log('🔄 Starting stream with JSON...', prevId ? '(follow-up)' : '(initial)');
        
        // Check if payload needs compression (over 40KB)
        const isLargePayload = payload.length > 40 * 1024;
        const compressedPayload = isLargePayload ? await compressPayload(payload) : payload;
        
        // Use JSON format for cleaner API
        requestBody = JSON.stringify({
          payload: compressedPayload,
          isCompressed: isLargePayload,
          ...(prevId && { previous_response_id: prevId })
        });
        
        headers['Content-Type'] = 'application/json';
        if (isLargePayload) {
          headers['Content-Encoding'] = 'gzip';
        }
        
        console.log('🔍 Original payload size:', payload.length);
        if (isLargePayload) {
          console.log('🔍 Compressed payload size:', compressedPayload.length);
          console.log('🔍 Compression ratio:', (compressedPayload.length / payload.length * 100).toFixed(1) + '%');
        }
      }
      
      const response = await fetch('/stream', {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal,
      });
      
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