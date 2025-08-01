import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { MCPClientManager } from './mcp/mcp-client';
import { ChatHandler } from './websocket/chat-handler';
import { StreamHandler } from './websocket/stream-handler';
import { TestHandlers } from './websocket/test-handlers';
import { authenticateSocket, AuthenticatedSocket } from './middleware/socketAuth';
import { createLogger } from './utils/logger';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import documentRoutes from './routes/documents';
import activityRoutes from './routes/activity';
import chatRoutes from './routes/chats';
import healthRoutes from './routes/health';
import testMcpRoutes from './routes/test-mcp';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const logger = createLogger();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/chats', chatRoutes);

// Health check routes
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// Test MCP routes (for debugging)
app.use('/test-mcp', testMcpRoutes);

// Test chat routes (for debugging)
import testChatRoutes from './routes/test-chat';
app.use('/test-chat', testChatRoutes);

// Test LLM + Tools routes (for debugging)
import testLlmToolsRoutes from './routes/test-llm-tools';
app.use('/test-llm-tools', testLlmToolsRoutes);

// Initialize MCP client manager
const mcpClientManager = new MCPClientManager();
const chatHandler = new ChatHandler(mcpClientManager);
const testHandlers = new TestHandlers(mcpClientManager);
const streamHandler = new StreamHandler();

// Socket.io authentication middleware
io.use(authenticateSocket);

// Socket.io connection handling
io.on('connection', (socket: AuthenticatedSocket) => {
  logger.info(`Client connected: ${socket.id} (User: ${socket.user?.email})`);

  // Setup test handlers for development tools
  testHandlers.setupTestHandlers(socket);

  // Handle chat messages
  socket.on('chat:message', async (data) => {
    try {
      if (!socket.user) {
        return socket.emit('error', { message: 'Authentication required' });
      }
      await chatHandler.handleMessage(socket, data);
    } catch (error) {
      logger.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  // Handle model selection
  socket.on('chat:select_model', async (data) => {
    if (!socket.user) {
      return socket.emit('error', { message: 'Authentication required' });
    }
    await chatHandler.setModel(socket.id, data.model, socket.user.userId);
    socket.emit('chat:model_selected', { model: data.model });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    chatHandler.cleanup(socket.id);
  });
});

// Initialize MCP connection on startup
async function initialize() {
  try {
    await mcpClientManager.initialize();
    logger.info('MCP client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP client:', error);
    process.exit(1);
  }
}

// Start server
server.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  await initialize();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await mcpClientManager.disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, io };