#!/bin/bash
# Script to run scenario tests

set -e

echo "Running YouTube API Mock scenario tests..."
echo ""

cd tests

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Check if proto-gen exists
if [ ! -d "proto-gen" ]; then
    echo "Generating proto client code..."
    npm run proto:generate
    echo ""
fi

# Run the tests
echo "Executing Gauge tests..."
npm test
