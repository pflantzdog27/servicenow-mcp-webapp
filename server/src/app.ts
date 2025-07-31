import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { MCPClientManager } from './mcp/mcp-client';
import { ChatHandler } from './websocket/chat-handler';
import { StreamHandler } from './websocket/stream-handler';
import { createLogger } from './utils/logger';
import authRoutes from './routes/auth';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const logger = createLogger();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Initialize MCP client manager
const mcpClientManager = new MCPClientManager();
const chatHandler = new ChatHandler(mcpClientManager);
const streamHandler = new StreamHandler();

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Handle chat messages
  socket.on('chat:message', async (data) => {
    try {
      await chatHandler.handleMessage(socket, data);
    } catch (error) {
      logger.error('Error handling chat message:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  // Handle model selection
  socket.on('chat:select_model', (data) => {
    chatHandler.setModel(socket.id, data.model);
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