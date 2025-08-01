# Migration Guide: Enhanced Claude-style MCP Integration

This guide will help you migrate your existing ServiceNow MCP webapp to use the new Claude-style tool interaction patterns with connection pooling, message queuing, and enhanced UI components.

## 🎯 Overview of Changes

### Frontend Enhancements
- **New EnhancedToolInvocationWithPrism**: Claude-style collapsible tool blocks with syntax highlighting
- **Enhanced Message Rendering**: Inline tool execution with real-time updates
- **Streaming Message Renderer**: Phase-based rendering (thinking → tools → responding)
- **Enhanced Chat Interface**: Complete streaming experience with retry capabilities

### Backend Enhancements
- **Connection Pooling**: MCP client connection pool for better performance
- **Message Queuing**: BullMQ integration for reliable processing
- **Enhanced Streaming**: Granular WebSocket events for each phase
- **PostgreSQL Migration**: Improved schema with vector support
- **Authentication & Rate Limiting**: Production-ready security

## 📋 Prerequisites

### Required Software
- **Node.js**: v18+ 
- **PostgreSQL**: v14+ (replaces SQLite)
- **Redis**: v6+ (for queuing and sessions)
- **ServiceNow MCP Server**: Your existing ServiceNow MCP integration

### Environment Setup
```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Install Redis (macOS)  
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib redis-server
sudo systemctl start postgresql redis-server
```

## 🗄️ Database Migration

### 1. PostgreSQL Setup
```bash
# Create databases
createdb servicenow_mcp_db
createdb servicenow_mcp_shadow  # For Prisma migrations

# Create user (optional)
createuser servicenow_user -P
```

### 2. Environment Variables
Update your server `.env` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/servicenow_mcp_db
SHADOW_DATABASE_URL=postgresql://username:password@localhost:5432/servicenow_mcp_shadow

# Redis Configuration  
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password

# MCP Connection Pool Settings
MCP_MIN_CONNECTIONS=2
MCP_MAX_CONNECTIONS=10
MCP_ACQUIRE_TIMEOUT=5000
MCP_IDLE_TIMEOUT=300000
MCP_HEALTH_CHECK_INTERVAL=30000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session Configuration
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRY=7d

# Existing ServiceNow Configuration (keep these)
SERVICENOW_MCP_PATH=/path/to/servicenow-mcp
SERVICENOW_INSTANCE_URL=https://instance.service-now.com
SERVICENOW_USERNAME=your_username
SERVICENOW_PASSWORD=your_password
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. Run Database Migration
```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Data Migration Script (Optional)
If you have existing SQLite data to migrate:

```typescript
// scripts/migrate-sqlite-to-postgres.ts
import { PrismaClient as SQLiteClient } from '@prisma/client-sqlite';
import { PrismaClient as PostgreSQLClient } from '@prisma/client';

async function migrateData() {
  const sqlite = new SQLiteClient({
    datasources: { db: { url: 'file:./prisma/dev.db' } }
  });
  
  const postgres = new PostgreSQLClient();

  // Migrate users
  const users = await sqlite.user.findMany();
  for (const user of users) {
    await postgres.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        password: user.password,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });
  }

  // Migrate chat sessions and messages...
  // Add your migration logic here
  
  await sqlite.$disconnect();
  await postgres.$disconnect();
}

// Run: npx tsx scripts/migrate-sqlite-to-postgres.ts
```

## 🚀 Code Integration

### 1. Frontend Component Updates

The components have already been updated in your views:
- `ChatView.tsx` → Uses `NewEnhancedChatInterface`
- `ChatDetailView.tsx` → Uses `NewEnhancedChatInterface`

### 2. Server Integration

#### Update your main app.ts:
```typescript
// Replace your existing WebSocket setup with:
import { setupEnhancedChatHandlers } from './websocket/chat-handler-updated';
import { initializeQueues, shutdownQueues } from './queues';
import { getEnhancedMCPClient } from './mcp/enhanced-mcp-client';

// Initialize enhanced systems
async function initializeServer() {
  // Initialize MCP client with connection pool
  const mcpClient = getEnhancedMCPClient();
  await mcpClient.initialize();

  // Initialize message queues
  await initializeQueues();

  // Setup enhanced WebSocket handlers
  io.on('connection', (socket) => {
    setupEnhancedChatHandlers(io, socket);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownQueues();
  await getEnhancedMCPClient().disconnect();
  process.exit(0);
});
```

#### WebSocket Authentication:
```typescript
// Add to your WebSocket middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      return next(new Error('Authentication failed'));
    }

    // Attach user info to socket
    (socket as any).userId = user.id;
    (socket as any).userEmail = user.email;
    (socket as any).userRole = user.role;
    
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});
```

### 3. Client-side CSS Updates

Add Prism.js theme to your `src/index.css`:
```css
/* Add after your existing imports */
@import 'prismjs/themes/prism-tomorrow.css';

/* Custom scrollbar styles for enhanced chat */
.scrollbar-thin {
  scrollbar-width: thin;
}

.scrollbar-track-gray-800 {
  scrollbar-color: #374151 #1f2937;
}

.scrollbar-thumb-gray-600 {
  scrollbar-color: #4b5563 #1f2937;
}

/* Webkit scrollbar styles */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-track-gray-800::-webkit-scrollbar-track {
  background: #1f2937;
}

.scrollbar-thumb-gray-600::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 3px;
}

.scrollbar-thumb-gray-600::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* Animation classes for enhanced UI */
.animate-in {
  animation-name: slideInFromTop;
  animation-duration: 200ms;
  animation-timing-function: ease-out;
}

.slide-in-from-top-1 {
  transform: translateY(-4px);
}

.slide-in-from-top-2 {
  transform: translateY(-8px);
}

@keyframes slideInFromTop {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

## 🔧 Configuration & Testing

### 1. Start Services
```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start PostgreSQL  
brew services start postgresql

# Terminal 3: Start server
cd server
npm run dev

# Terminal 4: Start client
cd client  
npm run dev
```

### 2. Test Enhanced Features

#### Test Tool Execution:
1. Send a message: "Create an incident for testing the new UI"
2. Watch for:
   - ✅ "Thinking..." indicator
   - ✅ "Using servicenow-mcp:create-incident..." 
   - ✅ Collapsible tool request/response blocks
   - ✅ Syntax-highlighted JSON
   - ✅ Copy buttons working
   - ✅ Execution timing displayed

#### Test Streaming:
1. Send a longer request
2. Verify:
   - ✅ Text streams word-by-word
   - ✅ Tool execution shows progress
   - ✅ Smooth transitions between phases
   - ✅ Final message renders correctly

#### Test Error Handling:
1. Trigger a tool failure (invalid parameters)
2. Check:
   - ✅ Error state displays clearly
   - ✅ Retry button appears and works
   - ✅ Error details are shown

### 3. Performance Monitoring

Check the health endpoint:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected", 
    "mcp": "ready",
    "mcpPool": {
      "total": 3,
      "available": 2,
      "inUse": 1,
      "waiting": 0
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### 1. MCP Connection Pool Issues
```bash
# Check MCP server is running
ps aux | grep servicenow-mcp

# Check environment variable
echo $SERVICENOW_MCP_PATH

# View connection pool logs
tail -f server/logs/combined.log | grep MCP
```

#### 2. Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping

# Check Redis logs
redis-cli monitor
```

#### 3. PostgreSQL Issues
```bash
# Check PostgreSQL status
brew services list | grep postgresql

# Test connection
psql -d servicenow_mcp_db -c "SELECT 1;"

# View database logs
tail -f /usr/local/var/log/postgresql@14.log
```

#### 4. WebSocket Issues
- Check browser console for connection errors
- Verify JWT token is being sent
- Check CORS configuration
- Ensure Socket.IO versions match (client/server)

### Performance Issues

#### Connection Pool Tuning:
```bash
# Increase pool size for high load
MCP_MIN_CONNECTIONS=5
MCP_MAX_CONNECTIONS=20
MCP_ACQUIRE_TIMEOUT=10000
```

#### Queue Configuration:
```bash
# Adjust concurrency for your hardware
QUEUE_CONCURRENCY=3  # Tool execution
QUEUE_CONCURRENCY_MESSAGES=2  # Message processing
```

## 🔄 Rollback Plan

If you need to rollback:

### 1. Frontend Rollback
```bash
# Revert component imports
git checkout HEAD~1 -- client/src/views/ChatView.tsx
git checkout HEAD~1 -- client/src/views/ChatDetailView.tsx
```

### 2. Backend Rollback  
```bash
# Use legacy handlers
git checkout HEAD~1 -- server/src/websocket/chat-handler.ts
```

### 3. Database Rollback
```bash
# Switch back to SQLite in schema.prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

npx prisma migrate reset
```

## 📈 Next Steps

### Production Deployment
1. **Environment**: Set `NODE_ENV=production`
2. **SSL**: Configure HTTPS certificates  
3. **Database**: Use managed PostgreSQL (AWS RDS, etc.)
4. **Redis**: Use managed Redis (AWS ElastiCache, etc.)
5. **Monitoring**: Add application monitoring (DataDog, New Relic)
6. **Logging**: Configure centralized logging
7. **Security**: Review rate limits and authentication

### Scaling Considerations
1. **Horizontal Scaling**: Multiple server instances with Redis
2. **Connection Pool**: Tune based on load testing
3. **Queue Workers**: Scale background job processing
4. **Database**: Connection pooling and read replicas
5. **CDN**: Serve static assets from CDN

## 🆘 Support

If you encounter issues:

1. **Check Logs**: `server/logs/combined.log`
2. **Health Endpoint**: `GET /health`
3. **Database Status**: `npx prisma studio`
4. **Queue Dashboard**: Consider adding Bull Dashboard
5. **WebSocket Debug**: Enable Socket.IO debug mode

This migration preserves all existing functionality while adding the enhanced Claude-style experience. The system gracefully falls back to legacy handlers if needed, ensuring zero downtime during deployment.