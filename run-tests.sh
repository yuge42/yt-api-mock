#!/bin/bash
# Script to run scenario tests with automatic server management

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVER_PID=""
SERVER_PORT="50051"
SERVER_HOST="127.0.0.1"

# Cleanup function to stop server
cleanup() {
    if [ -n "$SERVER_PID" ]; then
        echo -e "${YELLOW}Stopping mock server (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
        echo -e "${GREEN}Server stopped${NC}"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

echo "=========================================="
echo "YouTube API Mock - Scenario Test Runner"
echo "=========================================="
echo ""

# Step 1: Start the mock server
echo -e "${YELLOW}[1/4] Starting mock server on ${SERVER_HOST}:${SERVER_PORT}...${NC}"
BIND_ADDRESS="${SERVER_HOST}:${SERVER_PORT}" cargo run -p server > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to be ready..."
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if grep -q "Server listening on" /tmp/server.log 2>/dev/null; then
        echo -e "${GREEN}Server is ready (PID: $SERVER_PID)${NC}"
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -eq $MAX_WAIT ]; then
    echo -e "${RED}Error: Server failed to start within ${MAX_WAIT} seconds${NC}"
    cat /tmp/server.log
    exit 1
fi

echo ""

# Step 2: Setup test dependencies
cd tests

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[2/4] Installing test dependencies...${NC}"
    npm install
    echo -e "${GREEN}Dependencies installed${NC}"
    echo ""
else
    echo -e "${GREEN}[2/4] Dependencies already installed${NC}"
    echo ""
fi

# Step 3: Generate proto client code
if [ ! -d "proto-gen" ]; then
    echo -e "${YELLOW}[3/4] Generating proto client code...${NC}"
    npm run proto:generate
    echo -e "${GREEN}Proto client generated${NC}"
    echo ""
else
    echo -e "${GREEN}[3/4] Proto client already generated${NC}"
    echo ""
fi

# Step 4: Run the tests
echo -e "${YELLOW}[4/4] Running Gauge scenario tests...${NC}"
echo ""

if npm test; then
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "Tests completed successfully!"
    echo -e "==========================================${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}=========================================="
    echo -e "Tests failed!"
    echo -e "==========================================${NC}"
    exit 1
fi
