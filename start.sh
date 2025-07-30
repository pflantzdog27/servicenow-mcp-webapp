#!/bin/bash

# ServiceNow MCP Web Application Startup Script

echo "🚀 Starting ServiceNow MCP Web Application..."

# Check if .env files exist
if [ ! -f "server/.env" ]; then
    echo "❌ server/.env file not found. Please copy server/.env.example to server/.env and configure it."
    exit 1
fi

if [ ! -f "client/.env" ]; then
    echo "❌ client/.env file not found. Please copy client/.env.example to client/.env and configure it."
    exit 1
fi

# Check if node_modules exist
if [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install-all
fi

# Start the application
echo "🌟 Launching development servers..."
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend: http://localhost:3001"
echo "📊 Health Check: http://localhost:3001/api/health"
echo ""
echo "Press Ctrl+C to stop both servers"

npm run dev