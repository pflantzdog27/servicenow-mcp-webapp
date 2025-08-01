#!/bin/bash

# ServiceNow MCP Enhanced Setup Script
# This script helps set up the enhanced Claude-style MCP integration

set -e

echo "🚀 ServiceNow MCP Enhanced Setup"
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js v18+ required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo ""
echo "🔍 Checking dependencies..."

if ! command_exists psql; then
    echo "❌ PostgreSQL not found. Please install:"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

if ! command_exists redis-cli; then
    echo "❌ Redis not found. Please install:"
    echo "   macOS: brew install redis"
    echo "   Ubuntu: sudo apt-get install redis-server"
    exit 1
fi

echo "✅ PostgreSQL found: $(psql --version | head -n1)"
echo "✅ Redis found: $(redis-cli --version)"

# Check if services are running
echo ""
echo "🔍 Checking services..."

if ! pgrep -x "postgres" > /dev/null; then
    echo "⚠️  PostgreSQL not running. Starting..."
    if command_exists brew; then
        brew services start postgresql
    else
        sudo systemctl start postgresql
    fi
fi

if ! pgrep -x "redis-server" > /dev/null; then
    echo "⚠️  Redis not running. Starting..."
    if command_exists brew; then
        brew services start redis
    else
        sudo systemctl start redis-server
    fi
fi

# Test connections
echo ""
echo "🔍 Testing connections..."

if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis connection successful"
else
    echo "❌ Redis connection failed"
    exit 1
fi

# Setup databases
echo ""
echo "🗄️  Setting up databases..."

DB_NAME="servicenow_mcp_db"
SHADOW_DB_NAME="servicenow_mcp_shadow"

# Check if databases exist, create if not
if ! psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "📝 Creating database: $DB_NAME"
    createdb "$DB_NAME"
else
    echo "✅ Database $DB_NAME already exists"
fi

if ! psql -lqt | cut -d \| -f 1 | grep -qw "$SHADOW_DB_NAME"; then
    echo "📝 Creating shadow database: $SHADOW_DB_NAME"
    createdb "$SHADOW_DB_NAME"
else
    echo "✅ Shadow database $SHADOW_DB_NAME already exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."

echo "📦 Installing server dependencies..."
cd server
npm install

echo "📦 Installing client dependencies..."
cd ../client
npm install

# Go back to root
cd ..

# Setup environment files
echo ""
echo "⚙️  Setting up environment..."

if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.example" ]; then
        echo "📝 Creating server/.env from .env.example"
        cp server/.env.example server/.env
        echo "⚠️  Please update server/.env with your actual values!"
    else
        echo "❌ server/.env.example not found"
    fi
else
    echo "✅ server/.env already exists"
fi

# Update DATABASE_URL in .env if needed
if [ -f "server/.env" ]; then
    if grep -q "sqlite" server/.env; then
        echo "📝 Updating DATABASE_URL to PostgreSQL..."
        sed -i.bak 's|DATABASE_URL=.*|DATABASE_URL=postgresql://localhost:5432/servicenow_mcp_db|' server/.env
        echo "SHADOW_DATABASE_URL=postgresql://localhost:5432/servicenow_mcp_shadow" >> server/.env
        echo "REDIS_URL=redis://localhost:6379" >> server/.env
    fi
fi

# Run Prisma migrations
echo ""
echo "🔄 Running database migrations..."

cd server
npx prisma generate
npx prisma migrate dev --name init

# Build the project
echo ""
echo "🔨 Building project..."

npm run build

cd ../client
npm run build

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update server/.env with your ServiceNow MCP configuration"
echo "2. Start the development servers:"
echo "   Terminal 1: cd server && npm run dev"
echo "   Terminal 2: cd client && npm run dev"
echo ""
echo "🔍 Test the setup:"
echo "   curl http://localhost:3001/health"
echo ""
echo "📖 Read MIGRATION-GUIDE.md for detailed instructions"

# Check if .env needs updating
if grep -q "your_" server/.env 2>/dev/null; then
    echo ""
    echo "⚠️  IMPORTANT: Update the following in server/.env:"
    grep "your_" server/.env | head -5
    echo "   (and other placeholder values)"
fi

echo ""
echo "✅ Enhanced ServiceNow MCP setup completed successfully!"