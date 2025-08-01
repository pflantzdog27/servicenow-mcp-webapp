#!/bin/bash

echo "Starting Enhanced ServiceNow MCP Server..."
echo "=================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file based on .env.example"
    exit 1
fi

# Check for required environment variables
source .env

if [ -z "$SERVICENOW_MCP_PATH" ]; then
    echo "❌ Error: SERVICENOW_MCP_PATH is not set in .env!"
    echo "Please set the path to your ServiceNow MCP server executable"
    exit 1
fi

if [ ! -f "$SERVICENOW_MCP_PATH" ]; then
    echo "❌ Error: ServiceNow MCP server not found at: $SERVICENOW_MCP_PATH"
    echo "Please ensure the path is correct and the file exists"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "✅ ServiceNow MCP path: $SERVICENOW_MCP_PATH"

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Start the enhanced server
echo "Starting enhanced server with real MCP integration..."
npm run dev