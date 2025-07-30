#!/bin/bash

# ServiceNow MCP Web Application Setup Script

echo "🔧 Setting up ServiceNow MCP Web Application..."

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server && npm install && cd ..

# Install client dependencies  
echo "📦 Installing client dependencies..."
cd client && npm install && cd ..

# Copy environment files if they don't exist
if [ ! -f "server/.env" ]; then
    echo "📄 Creating server/.env from template..."
    cp server/.env.example server/.env
    echo "⚠️  Please edit server/.env with your configuration"
fi

if [ ! -f "client/.env" ]; then
    echo "📄 Creating client/.env from template..."
    cp client/.env.example client/.env
    echo "⚠️  Please edit client/.env with your configuration"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit server/.env with your ServiceNow MCP path and API keys"
echo "2. Edit client/.env with your ServiceNow instance URL"
echo "3. Run './start.sh' to start the application"
echo ""
echo "For detailed setup instructions, see README.md"