#!/bin/bash

# Multi-Server Chrome Launcher for OpenAI Realtime Console
# Starts 10 server instances and opens them in Chrome tabs
# Press Ctrl+C to gracefully shutdown all servers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Array to store process IDs
declare -a PIDS=()

# Function to cleanup all processes
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down all servers...${NC}"
    
    for i in "${!PIDS[@]}"; do
        local pid=${PIDS[$i]}
        local port=$((3000 + $i))
        
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}   Stopping server on port $port (PID: $pid)${NC}"
            kill -TERM $pid 2>/dev/null || true
        fi
    done
    
    # Wait a moment for graceful shutdown
    sleep 2
    
    # Force kill any remaining processes
    for i in "${!PIDS[@]}"; do
        local pid=${PIDS[$i]}
        local port=$((3000 + $i))
        
        if kill -0 $pid 2>/dev/null; then
            echo -e "${RED}   Force killing server on port $port (PID: $pid)${NC}"
            kill -KILL $pid 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ All servers stopped${NC}"
    exit 0
}

# Function to stop any existing servers first
stop_existing_servers() {
    echo -e "${YELLOW}🔍 Checking for existing server instances...${NC}"
    
    # Find all node processes running server.js
    local existing_pids=$(ps aux | grep "server.js --dev" | grep -v grep | awk '{print $2}' || true)
    
    if [[ -n "$existing_pids" ]]; then
        echo -e "${YELLOW}   Found existing servers, stopping them first...${NC}"
        
        # Graceful shutdown
        for pid in $existing_pids; do
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}     Stopping PID: $pid${NC}"
                kill -TERM $pid 2>/dev/null || true
            fi
        done
        
        sleep 2
        
        # Force kill any remaining
        for pid in $existing_pids; do
            if kill -0 $pid 2>/dev/null; then
                echo -e "${RED}     Force killing PID: $pid${NC}"
                kill -KILL $pid 2>/dev/null || true
            fi
        done
        
        # Also check ports 3000-3009
        for port in {3000..3009}; do
            local port_pid=$(lsof -ti :$port 2>/dev/null || true)
            if [[ -n "$port_pid" ]]; then
                echo -e "${YELLOW}     Freeing port $port (PID: $port_pid)${NC}"
                kill -KILL $port_pid 2>/dev/null || true
            fi
        done
        
        echo -e "${GREEN}   ✅ Existing servers stopped${NC}"
    else
        echo -e "${GREEN}   ✅ No existing servers found${NC}"
    fi
}

# Function to check if Chrome is available
check_chrome() {
    if command -v google-chrome >/dev/null 2>&1; then
        echo "google-chrome"
    elif command -v google-chrome-stable >/dev/null 2>&1; then
        echo "google-chrome-stable"
    elif command -v chromium >/dev/null 2>&1; then
        echo "chromium"
    elif command -v chromium-browser >/dev/null 2>&1; then
        echo "chromium-browser"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if [[ -d "/Applications/Google Chrome.app" ]]; then
            echo "open -a 'Google Chrome'"
        else
            echo ""
        fi
    else
        echo ""
    fi
}

# Function to open Chrome with multiple tabs
open_chrome_tabs() {
    local chrome_cmd=$(check_chrome)
    
    if [[ -z "$chrome_cmd" ]]; then
        echo -e "${RED}❌ Chrome not found. Please install Google Chrome or Chromium.${NC}"
        echo -e "${YELLOW}   You can manually open these URLs:${NC}"
        for i in {0..9}; do
            local port=$((3000 + $i))
            echo -e "${YELLOW}     http://localhost:$port${NC}"
        done
        return 1
    fi
    
    echo -e "${BLUE}🌐 Opening Chrome with multiple tabs...${NC}"
    
    # Build the URLs
    local urls=""
    for i in {0..9}; do
        local port=$((3000 + $i))
        urls="$urls http://localhost:$port"
    done
    
    # Open Chrome with all URLs
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open -a "Google Chrome" $urls
    else
        # Linux
        $chrome_cmd $urls &
    fi
    
    echo -e "${GREEN}   ✅ Chrome opened with tabs for ports 3000-3009${NC}"
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Check if we're in the right directory
if [[ ! -f "server/server.js" ]]; then
    echo -e "${RED}❌ Error: server/server.js not found. Please run this script from the project root.${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 OpenAI Realtime Console Multi-Server Chrome Launcher${NC}"
echo -e "${BLUE}   Starting 10 server instances and opening them in Chrome${NC}"
echo -e "${BLUE}   Press Ctrl+C to stop all servers and exit${NC}\n"

# Stop any existing servers first
stop_existing_servers

# Create logs directory if it doesn't exist
mkdir -p logs

echo -e "\n${GREEN}🔄 Starting fresh server instances...${NC}"

# Start 10 server instances
for i in {0..9}; do
    PORT=$((3000 + $i))
    
    echo -e "${GREEN}   Starting server on port $PORT...${NC}"
    
    # Start server in background
    PORT=$PORT node --loader ts-node/esm server/server.js --dev > "logs/server-$PORT.log" 2>&1 &
    
    # Store the PID
    PIDS[$i]=$!
    
    echo -e "${GREEN}     ✅ Server started on port $PORT (PID: ${PIDS[$i]})${NC}"
    
    # Brief pause between starts
    sleep 0.5
done

echo -e "\n${GREEN}🎉 All servers started successfully!${NC}"

# Wait a moment for servers to fully initialize
echo -e "${BLUE}⏳ Waiting for servers to initialize...${NC}"
sleep 3

# Open Chrome tabs
open_chrome_tabs

echo -e "\n${BLUE}📊 Server Status:${NC}"

# Display status of all servers
for i in {0..9}; do
    PORT=$((3000 + $i))
    PID=${PIDS[$i]}
    
    if [[ -n "$PID" ]] && kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}   ✅ Port $PORT: Running (PID: $PID) - http://localhost:$PORT${NC}"
    else
        echo -e "${RED}   ❌ Port $PORT: Not running${NC}"
    fi
done

echo -e "\n${YELLOW}📋 Useful Commands:${NC}"
echo -e "${YELLOW}   • View logs: tail -f logs/server-3000.log${NC}"
echo -e "${YELLOW}   • Check status: lsof -i :3000-3009${NC}"
echo -e "${YELLOW}   • Stop all: Press Ctrl+C${NC}"

echo -e "\n${BLUE}🔍 All servers running with Chrome tabs open! Press Ctrl+C to stop.${NC}\n"

# Keep the script running and monitor servers
while true; do
    sleep 10
    
    # Check if any servers have died
    for i in "${!PIDS[@]}"; do
        pid=${PIDS[$i]}
        port=$((3000 + $i))
        
        if [[ -n "$pid" ]] && ! kill -0 $pid 2>/dev/null; then
            echo -e "${RED}⚠️  Server on port $port (PID: $pid) has stopped unexpectedly${NC}"
            PIDS[$i]=""
        fi
    done
done
