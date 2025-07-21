# Concurrent Terminal Usage Guide

This document explains how to safely use multiple terminals/sessions with the OpenAI Realtime Console without encountering timeout errors or resource conflicts.

## Problem Overview

Previously, using multiple terminals simultaneously would cause:
- **Socket timeout errors** (300-second timeouts)
- **404 NotFoundError** for function call/response stream IDs
- **Resource conflicts** between concurrent sessions
- **Rate limiting issues** with OpenAI API

## Solution: Connection Manager

We've implemented a centralized connection manager that handles:
- **Connection pooling** (5 OpenAI client instances)
- **Request queuing** with priority levels
- **Rate limiting** (max 3 concurrent requests)
- **Automatic retries** with exponential backoff
- **Session tracking** for better debugging

## Key Improvements

### 1. High-Quality Model Usage
- **Before**: Used `o3` model without connection management (caused timeouts)
- **After**: Uses `o3` model with `reasoning: "high"` and proper connection management

### 2. Connection Management
- **Before**: Each terminal created its own OpenAI client
- **After**: Shared connection pool with round-robin distribution

### 3. Request Queuing
- **Before**: All requests sent immediately, overwhelming the API
- **After**: Intelligent queuing with priority levels (high/normal/low)

### 4. Session Tracking
- **Before**: No way to track which terminal caused issues
- **After**: Each request includes a unique session ID for debugging

## Usage Guide

### Starting Multiple Terminals

You can now safely start multiple terminals by:

1. **In the UI**: Simply open multiple browser tabs/windows
2. **Via API**: Use different session IDs in the `x-session-id` header

### Best Practices

1. **Stagger Terminal Starts**: Wait 2-3 seconds between starting new terminals
2. **Use Session IDs**: Include unique `x-session-id` headers for API calls
3. **Monitor Connection Stats**: Check `/api/connection-stats` endpoint

### Testing Concurrent Usage

Run the included test script to verify everything works:

```bash
# Test 5 terminals with 3 requests each
node scripts/test-multiple-terminals.js
```

This will simulate realistic concurrent usage and report success/failure rates.

## Configuration

### Connection Manager Settings

```typescript
const maxConcurrentRequests = 3;    // Limit concurrent OpenAI requests
const maxClientInstances = 5;       // Pool of OpenAI clients
const queueTimeout = 120000;        // 2 minutes queue timeout
const requestTimeout = 180000;      // 3 minutes per request
```

### Request Priorities

- **High**: Real-time sessions with active users
- **Normal**: Regular architecture generation
- **Low**: Background/batch operations

## Monitoring

### Connection Stats Endpoint

```bash
curl http://localhost:3000/api/connection-stats
```

Returns:
```json
{
  "activeConnections": 2,
  "queuedRequests": 1,
  "completedRequests": 15,
  "failedRequests": 0,
  "totalTimeouts": 0,
  "timestamp": "2025-01-09T03:45:00.000Z",
  "uptime": 1234.5
}
```

### Log Messages

Look for these log patterns:
```
🔧 Initialized 5 OpenAI client instances
📥 Queued request req-1234567890 with priority normal (1 in queue)
🚀 Executing request req-1234567890 (2/3 active)
✅ Request req-1234567890 completed successfully
```

## Error Handling

### Queue Timeouts
If a request waits in queue for >2 minutes, it will be rejected with:
```
Error: Request timed out in queue
```

### API Rate Limits
The connection manager automatically handles OpenAI rate limits with exponential backoff.

### Authentication Errors
401/403 errors are not retried (they indicate invalid API keys).

## Troubleshooting

### High Queue Times
If requests are spending too long in queue:
1. Check if any terminals are making very long requests
2. Consider reducing `maxConcurrentRequests` if you hit OpenAI limits
3. Monitor the connection stats endpoint

### Memory Usage
The connection manager maintains state for active requests. If memory usage grows:
1. Check for stuck requests that aren't completing
2. Restart the server to clear the queue

### Session ID Conflicts
Each terminal should use a unique session ID. The system generates them automatically, but you can override by setting the `x-session-id` header.

## Migration from Previous Version

If you were experiencing timeout errors before:

1. **Update your code**: The connection manager is automatically enabled
2. **Remove manual retries**: The system now handles retries centrally
3. **Update session tracking**: Use the new session ID system for debugging
4. **Test thoroughly**: Use the provided test script to verify everything works

## Performance Expectations

With the connection manager:
- **Concurrent terminals**: 5+ terminals can run simultaneously
- **Request success rate**: 95%+ under normal conditions
- **Average request time**: 30-60 seconds (vs 5+ minutes before)
- **Queue wait time**: <10 seconds under normal load

## Support

If you encounter issues with multiple terminals:

1. Check the connection stats endpoint
2. Look for queue timeout errors in logs
3. Verify session IDs are unique
4. Run the test script to isolate the issue 