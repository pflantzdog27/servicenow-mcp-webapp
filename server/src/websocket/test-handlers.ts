import { Socket } from 'socket.io';
import { MCPClientManager } from '../mcp/mcp-client';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const logger = createLogger();
const prisma = new PrismaClient();

export class TestHandlers {
  private mcpClientManager: MCPClientManager;

  constructor(mcpClientManager: MCPClientManager) {
    this.mcpClientManager = mcpClientManager;
  }

  setupTestHandlers(socket: Socket): void {
    // MCP Connection Test
    socket.on('test:mcp-connection', async () => {
      try {
        // Test legacy client (which is what we're actually using)
        const tools = this.mcpClientManager.getAvailableTools();
        const isConnected = tools.length > 0;
        
        socket.emit('test:mcp-connection-result', {
          success: isConnected,
          type: 'legacy',
          details: { 
            toolCount: tools.length,
            tools: tools.slice(0, 5).map(t => t.name) // First 5 tool names
          }
        });
      } catch (error) {
        logger.error('MCP connection test failed:', error);
        socket.emit('test:mcp-connection-result', {
          success: false,
          error: error instanceof Error ? error.message : 'MCP connection test failed'
        });
      }
    });

    // Tool Discovery Test
    socket.on('test:tool-discovery', async () => {
      try {
        const tools = this.mcpClientManager.getAvailableTools();

        socket.emit('test:tool-discovery-result', {
          success: tools.length > 0,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description || 'No description',
            inputSchema: tool.inputSchema
          })),
          clientType: 'legacy',
          count: tools.length
        });
      } catch (error) {
        logger.error('Tool discovery test failed:', error);
        socket.emit('test:tool-discovery-result', {
          success: false,
          error: error instanceof Error ? error.message : 'Tool discovery failed'
        });
      }
    });

    // Developer Tools Status Requests
    socket.on('dev:get-status', async () => {
      try {
        const status = await this.getSystemStatus();
        socket.emit('dev:status-update', status);
      } catch (error) {
        logger.error('Failed to get system status:', error);
        socket.emit('dev:status-update', {
          websocket: { connected: true },
          mcp: { connected: false },
          database: { connected: false },
          redis: { connected: false }
        });
      }
    });

    socket.on('dev:get-tool-history', async () => {
      try {
        // Get recent tool executions from database
        const executions = await prisma.toolExecution.findMany({
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: {
            message: {
              select: { id: true, role: true }
            }
          }
        });

        const formattedExecutions = executions.map(exec => ({
          id: exec.id,
          toolName: exec.toolName,
          timestamp: exec.createdAt,
          duration: exec.executionTime || 0,
          status: exec.status === 'COMPLETED' ? 'success' : 'error',
          arguments: exec.arguments ? JSON.parse(exec.arguments) : {},
          result: exec.result ? JSON.parse(exec.result) : null,
          error: exec.error
        }));

        socket.emit('dev:tool-history', formattedExecutions);
      } catch (error) {
        logger.error('Failed to get tool history:', error);
        socket.emit('dev:tool-history', []);
      }
    });

    socket.on('dev:get-queue-status', async () => {
      try {
        // Mock queue status for now (would integrate with actual BullMQ)
        const queueJobs = [
          {
            id: 'job-1',
            name: 'Message Processing',
            status: 'active',
            timestamp: new Date(),
            attempts: 1,
            progress: 75
          }
        ];

        socket.emit('dev:queue-update', queueJobs);
      } catch (error) {
        logger.error('Failed to get queue status:', error);
        socket.emit('dev:queue-update', []);
      }
    });

    socket.on('dev:get-rate-limits', async () => {
      try {
        // Mock rate limit status
        const rateLimits = {
          remaining: 85,
          total: 100,
          resetTime: new Date(Date.now() + 15 * 60 * 1000),
          blocked: false
        };

        socket.emit('dev:rate-limit-update', rateLimits);
      } catch (error) {
        logger.error('Failed to get rate limits:', error);
        socket.emit('dev:rate-limit-update', {
          remaining: 100,
          total: 100,
          resetTime: new Date(),
          blocked: false
        });
      }
    });

    // Ping/Pong for WebSocket latency testing
    socket.on('ping', () => {
      socket.emit('pong');
    });

    logger.info('Test handlers set up for socket:', socket.id);
  }

  private async getSystemStatus() {
    const [databaseStatus, redisStatus, mcpStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMCP()
    ]);

    return {
      websocket: {
        connected: true,
        latency: 0, // Would be calculated based on ping/pong
        lastPing: new Date()
      },
      mcp: mcpStatus,
      database: databaseStatus,
      redis: redisStatus
    };
  }

  private async checkDatabase() {
    try {
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      
      return {
        connected: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        connected: false,
        responseTime: 0
      };
    }
  }

  private async checkRedis() {
    try {
      if (!process.env.REDIS_URL) {
        return {
          connected: false,
          responseTime: 0
        };
      }

      const startTime = Date.now();
      const redis = new Redis(process.env.REDIS_URL);
      await redis.ping();
      await redis.quit();
      
      return {
        connected: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        connected: false,
        responseTime: 0
      };
    }
  }

  private async checkMCP() {
    try {
      const tools = this.mcpClientManager.getAvailableTools();
      
      return {
        connected: tools.length > 0,
        lastActivity: new Date()
      };
    } catch (error) {
      return {
        connected: false,
        lastActivity: new Date()
      };
    }
  }
}

export default TestHandlers;