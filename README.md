# OpenAI Realtime Console

A console application for the OpenAI Realtime API.

## Quick Start

### Single Server (Original)
```bash
npm run dev
```

### Multi-Server Setup (Recommended for High Availability)
```bash
# Start 10 server instances on ports 3000-3009
./scripts/run-multi-servers.sh

# The script handles:
# ✅ Auto-cleanup of existing servers
# ✅ Starts 10 fresh server instances
# ✅ Graceful shutdown with Ctrl+C
# ✅ Logs saved to logs/ directory
# ✅ Process monitoring
```

## Multi-Server Features

**Benefits:**
- **High Availability**: Multiple server instances for redundancy
- **Load Distribution**: OpenAI requests distributed across instances
- **Multi-Server Compatibility**: No 404 errors between different server instances
- **Easy Management**: Single script for start/stop operations

**Access Points:**
- http://localhost:3000 through http://localhost:3009
- All instances share the same codebase and functionality
- Load balancer compatible

**Monitoring:**
```bash
# View server logs
tail -f logs/server-3000.log

# Check running instances
lsof -i :3000-3009

# Stop all servers
# Just press Ctrl+C in the script terminal
```

## Architecture

This console uses the OpenAI O3 model with ultra-comprehensive conversation cleaning for multi-server compatibility. Key features:

- **404 Error Prevention**: Automatic cleaning of OpenAI-specific IDs
- **Timeout Elimination**: O3 model can process for unlimited time
- **Connection Pooling**: 5 OpenAI client instances per server
- **Automatic Recovery**: 404 errors trigger fresh conversation recovery

## Development

### Requirements
- Node.js 18+
- OpenAI API key with O3 model access

### Setup
```bash
npm install
npm run build
./scripts/run-multi-servers.sh
```

### File Structure
- `server/` - Server-side code with multi-server support
- `client/` - React frontend with real-time architecture generation
- `scripts/` - Utility scripts including multi-server manager
- `logs/` - Server logs (auto-created)
# Test change
