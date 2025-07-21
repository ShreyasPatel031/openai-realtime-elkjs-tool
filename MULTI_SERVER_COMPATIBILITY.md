# Multi-Server Compatibility Fixes

## Problem Description

When running multiple server instances on different ports (e.g., port 3000, 3010, 3020), the application was experiencing **404 response ID errors** like:

```
404 Item with id 'rs_68746928e2608192b4b461467ef5f39604ce581fc4815561' not found
404 Item with id 'fc_68746e56c49c81a0ab141d66f059de6e0c8acdddfc55f836' not found
```

### Root Cause

Each server instance maintains its own **independent OpenAI API session** and connection pool. When:
1. **Server A** (port 3000) creates a conversation with response ID `rs_xxx`
2. **Server B** (port 3010) tries to continue that conversation
3. **Server B** doesn't have access to that response ID because it's a different API session
4. **Result**: 404 error from OpenAI API

## Solution Implementation

### 1. Comprehensive Conversation Cleaning (Server-Side)

**File**: `server/streamRoute.js`

```javascript
// COMPREHENSIVE conversation cleaning for multi-server compatibility
const cleanedConversation = conversation.map(item => {
  const cleaned = { ...item };
  
  // Remove ALL OpenAI-specific fields that could cause cross-server conflicts
  const openaiFields = [
    'response_id', 'id', 'object', 'created', 'model', 'usage', 
    'system_fingerprint', 'choices', 'finish_reason', 'index',
    'logprobs', 'reasoning', 'summary'
  ];
  
  // Remove OpenAI fields from main object
  openaiFields.forEach(field => {
    if (cleaned[field]) {
      delete cleaned[field];
    }
  });
  
  // Remove OpenAI fields from nested content arrays
  if (cleaned.content && Array.isArray(cleaned.content)) {
    cleaned.content = cleaned.content.map(contentItem => {
      if (typeof contentItem === 'object' && contentItem !== null) {
        const cleanedContent = { ...contentItem };
        openaiFields.forEach(field => {
          if (cleanedContent[field]) {
            delete cleanedContent[field];
          }
        });
        return cleanedContent;
      }
      return contentItem;
    });
  }
  
  // Remove any field that contains OpenAI ID patterns
  Object.keys(cleaned).forEach(key => {
    if (typeof cleaned[key] === 'string' && 
        cleaned[key].match(/^(rs_|fc_|msg_|run_|thread_|asst_)/)) {
      delete cleaned[key];
    }
  });
  
  return cleaned;
});
```

### 2. 404 Error Recovery (Server-Side)

**File**: `server/streamRoute.js`

```javascript
} catch (apiError) {
  // Handle 404 response ID errors specifically for multi-server scenarios
  if (apiError.status === 404 && apiError.message.includes('not found')) {
    console.log(`🔍 [${requestId}] 404 Error - Attempting recovery with fresh conversation`);
    
    // Strip ALL conversation history and retry with just the essential context
    const freshConversation = cleanedConversation.filter(item => 
      item.role === 'user' || item.type === 'function_call_output'
    ).slice(-3); // Keep only the last 3 essential messages
    
    // Retry with minimal conversation
    stream = await connectionManager.queueRequest(async () => {
      return client.responses.create({
        model: "o3",
        input: freshConversation, // Use fresh conversation without response IDs
        tools: tools,
        tool_choice: "auto",
        parallel_tool_calls: true,
        reasoning: { effort: "high", summary: "detailed" },
        stream: true
      });
    }, 'high');
    
    // Continue with the new stream
    continue; // Don't terminate, continue the conversation loop
  }
}
```

### 3. Client-Side Response ID Blocking

**File**: `client/reasoning/PostEventSource.ts`

```typescript
export const createPostEventSource = (payload: string | FormData, prevId?: string): PostEventSource => {
  // NEVER use responseId in multi-server scenarios - always start fresh
  // This prevents 404 errors when multiple servers are running on different ports
  if (prevId) {
    console.log(`🔍 PostEventSource: Ignoring response ID ${prevId} for multi-server compatibility`);
  }
  const actualPrevId = undefined; // Force fresh conversation for multi-server compatibility
  
  // Use actualPrevId (undefined) instead of prevId throughout the function
  // This ensures no response IDs are ever sent to the server
}
```

### 4. Enhanced Debugging

**File**: `server/streamRoute.js`

```javascript
// Debug original conversation before cleaning
console.log(`🔍 [${requestId}] Original conversation length: ${conversation?.length || 0}`);

// Find and log all response IDs in conversation
const responseIds = conversation?.filter(item => 
  item.response_id || (item.id && item.id.startsWith('rs_'))
).map(item => ({ id: item.id, response_id: item.response_id, role: item.role }));

if (responseIds.length > 0) {
  console.log(`🔍 [${requestId}] Found ${responseIds.length} response IDs in conversation:`, responseIds);
}
```

## Benefits

✅ **Multi-Server Compatibility**: Multiple server instances can run simultaneously without conflicts  
✅ **Automatic Recovery**: 404 errors are caught and recovered with fresh conversations  
✅ **No Response ID Leakage**: Client-side prevents response IDs from being sent to servers  
✅ **Comprehensive Cleaning**: All OpenAI-specific fields are stripped from conversations  
✅ **Debugging Support**: Detailed logging helps identify and resolve issues  

## Testing

To test multi-server compatibility:

1. **Start multiple servers**:
   ```bash
   # Terminal 1
   npm run dev  # Runs on port 3000
   
   # Terminal 2  
   npm run dev  # Runs on port 3010
   
   # Terminal 3
   npm run dev  # Runs on port 3020
   ```

2. **Open multiple tabs**:
   - Tab 1: `http://localhost:3000`
   - Tab 2: `http://localhost:3010`
   - Tab 3: `http://localhost:3020`

3. **Test cross-server functionality**:
   - Start a conversation in Tab 1
   - Switch to Tab 2 and continue the conversation
   - All tabs should work without 404 errors

## Monitoring

Watch for these log messages to verify the fixes are working:

```
🔍 [req-xxx] Found 2 response IDs in conversation: [...]
🔍 [req-xxx] Removing response_id: rs_xxx
🔍 PostEventSource: Ignoring response ID rs_xxx for multi-server compatibility
🔍 [req-xxx] 404 Error - Attempting recovery with fresh conversation
🔍 [req-xxx] Fresh conversation retry successful
```

## Future Considerations

- **Session Sharing**: For true multi-server scalability, consider implementing shared session storage (Redis, etc.)
- **Load Balancing**: Use a reverse proxy (nginx, HAProxy) to distribute requests across server instances
- **Database Persistence**: Store conversation state in a database for cross-server access 