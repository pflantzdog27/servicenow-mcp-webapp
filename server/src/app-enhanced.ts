import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import session from 'express-session';
import connectRedis from 'connect-redis';
import IORedis from 'ioredis';

// Import middleware
import { authenticate, authorize } from './middleware/enhanced-auth';
import { 
  globalRateLimiter, 
  apiRateLimiter, 
  authRateLimiter,
  addRateLimitHeaders 
} from './middleware/rate-limiter';

// Import services
import { getEnhancedMCPClient } from './mcp/enhanced-mcp-client';
import { initializeQueues, shutdownQueues } from './queues';
import { createLogger } from './utils/logger';

// Import routes
import authRoutes from './routes/auth';
import chatRoutes from './routes/chats';
import projectRoutes from './routes/projects';
import activityRoutes from './routes/activity';
import documentRoutes from './routes/documents';

// Import WebSocket handlers
import { setupEnhancedChatHandlers } from './websocket/enhanced-chat-handler';
import { setupEnhancedStreamHandlers } from './websocket/enhanced-stream-handler';

// Load environment variables
dotenv.config();

const logger = createLogger();
const prisma = new PrismaClient();
const app = express();
const server = createServer(app);

// Redis client for session store
const redisClient = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

// Configure session store
const RedisStore = connectRedis(session);
const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

// Configure Socket.IO with authentication
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(addRateLimitHeaders);

// Global rate limiting
app.use(globalRateLimiter);

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Redis connection
    await redisClient.ping();
    
    // Check MCP client
    const mcpClient = getEnhancedMCPClient();
    const mcpReady = mcpClient.isReady();
    const poolStats = mcpClient.getPoolStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        mcp: mcpReady ? 'ready' : 'not ready',
        mcpPool: poolStats,
      },
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: String(error),
    });
  }
});

// API Routes
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/chats', authenticate, apiRateLimiter, chatRoutes);
app.use('/api/projects', authenticate, apiRateLimiter, projectRoutes);
app.use('/api/activity', authenticate, apiRateLimiter, activityRoutes);
app.use('/api/documents', authenticate, apiRateLimiter, documentRoutes);

// Admin routes (require ADMIN role)
app.get('/api/admin/stats', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const [userCount, sessionCount, messageCount, toolExecutionCount] = await Promise.all([
      prisma.user.count(),
      prisma.chatSession.count(),
      prisma.message.count(),
      prisma.toolExecution.count(),
    ]);

    const mcpClient = getEnhancedMCPClient();
    const poolStats = mcpClient.getPoolStats();

    res.json({
      users: userCount,
      sessions: sessionCount,
      messages: messageCount,
      toolExecutions: toolExecutionCount,
      mcpPool: poolStats,
    });
  } catch (error) {
    logger.error('Failed to get admin stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('No token provided'));
    }

    // Verify token and get user
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return next(new Error('User not found or inactive'));
    }

    // Attach user to socket
    (socket as any).userId = user.id;
    (socket as any).userEmail = user.email;
    (socket as any).userRole = user.role;
    
    next();
  } catch (error) {
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = (socket as any).userId;
  logger.info(`User ${userId} connected via WebSocket`);

  // Join user-specific room
  socket.join(`user:${userId}`);

  // Setup handlers
  setupEnhancedChatHandlers(io, socket);
  setupEnhancedStreamHandlers(io, socket);

  socket.on('disconnect', () => {
    logger.info(`User ${userId} disconnected`);
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      error: 'Database operation failed',
      code: err.code,
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Starting graceful shutdown');

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO
  io.close(() => {
    logger.info('Socket.IO closed');
  });

  try {
    // Shutdown queues
    await shutdownQueues();

    // Disconnect MCP client
    const mcpClient = getEnhancedMCPClient();
    await mcpClient.disconnect();

    // Close Redis connections
    await redisClient.quit();

    // Disconnect Prisma
    await prisma.$disconnect();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
async function startServer() {
  try {
    // Initialize MCP client with connection pool
    const mcpClient = getEnhancedMCPClient();
    await mcpClient.initialize();

    // Initialize message queues
    await initializeQueues();

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();