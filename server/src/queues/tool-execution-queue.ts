import { Job } from 'bullmq';
import { getQueueManager } from './queue-manager';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const logger = createLogger();
const prisma = new PrismaClient();
const queueManager = getQueueManager();
const mcpClient = getEnhancedMCPClient();

const QUEUE_NAME = 'tool-execution';

export interface ToolExecutionJobData {
  toolName: string;
  arguments: any;
  messageId: string;
  sessionId: string;
  userId: string;
  priority?: number;
}

export function initializeToolExecutionQueue() {
  // Create the queue
  queueManager.createQueue(QUEUE_NAME, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  });

  // Create the worker
  queueManager.createWorker(
    QUEUE_NAME,
    async (job: Job<ToolExecutionJobData>) => {
      const { toolName, arguments: toolArgs, messageId, sessionId, userId } = job.data;
      
      logger.info(`Processing tool execution job ${job.id}`, {
        toolName,
        messageId,
        sessionId,
        userId,
      });

      // Update job progress
      await job.updateProgress(10);

      try {
        // Check if MCP client is ready
        if (!mcpClient.isReady()) {
          throw new Error('MCP client is not ready');
        }

        // Update job progress
        await job.updateProgress(30);

        // Execute the tool
        const result = await mcpClient.executeTool(
          {
            name: toolName,
            arguments: toolArgs,
          },
          messageId
        );

        // Update job progress
        await job.updateProgress(90);

        // Emit result via Socket.IO (if needed)
        // This would be handled by the websocket handler

        // Update job progress
        await job.updateProgress(100);

        logger.info(`Tool execution job ${job.id} completed successfully`);
        return result;
      } catch (error) {
        logger.error(`Tool execution job ${job.id} failed:`, error);
        
        // Update tool execution status in database
        await prisma.toolExecution.updateMany({
          where: {
            messageId,
            toolName,
            status: 'QUEUED',
          },
          data: {
            status: 'FAILED',
            error: String(error),
          },
        });

        throw error;
      }
    },
    {
      concurrency: 5, // Process up to 5 tools in parallel
      limiter: {
        max: 10,
        duration: 1000, // Max 10 jobs per second
      },
    }
  );

  logger.info('Tool execution queue initialized');
}

export async function queueToolExecution(data: ToolExecutionJobData): Promise<string> {
  const job = await queueManager.addJob(QUEUE_NAME, data, {
    priority: data.priority || 0,
    trackInDb: true,
  });
  
  return job.id;
}

export async function getToolExecutionQueueStats() {
  return queueManager.getQueueStats(QUEUE_NAME);
}