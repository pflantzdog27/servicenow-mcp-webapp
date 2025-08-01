import { Job } from 'bullmq';
import { getQueueManager } from './queue-manager';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const logger = createLogger();
const prisma = new PrismaClient();
const queueManager = getQueueManager();

const QUEUE_NAME = 'message-processing';

export interface MessageProcessingJobData {
  sessionId: string;
  userId: string;
  message: string;
  model: string;
  includeContext?: boolean;
  contextMessageCount?: number;
}

export function initializeMessageProcessingQueue() {
  // Create the queue
  queueManager.createQueue(QUEUE_NAME, {
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  });

  // Create the worker
  queueManager.createWorker(
    QUEUE_NAME,
    async (job: Job<MessageProcessingJobData>) => {
      const { sessionId, userId, message, model, includeContext, contextMessageCount } = job.data;
      
      logger.info(`Processing message job ${job.id}`, {
        sessionId,
        userId,
        model,
      });

      try {
        // Update job progress
        await job.updateProgress(10);

        // Verify session exists and belongs to user
        const session = await prisma.chatSession.findFirst({
          where: {
            id: sessionId,
            userId,
          },
        });

        if (!session) {
          throw new Error('Chat session not found or unauthorized');
        }

        // Update job progress
        await job.updateProgress(20);

        // Create user message record
        const userMessage = await prisma.message.create({
          data: {
            sessionId,
            role: 'USER',
            content: message,
            model,
          },
        });

        // Update job progress
        await job.updateProgress(30);

        // Get context messages if requested
        let contextMessages = [];
        if (includeContext) {
          contextMessages = await prisma.message.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: contextMessageCount || 10,
            include: {
              toolExecutions: true,
            },
          });
          contextMessages.reverse(); // Put in chronological order
        }

        // Update job progress
        await job.updateProgress(50);

        // Here you would typically:
        // 1. Send the message to the LLM service
        // 2. Process the response
        // 3. Execute any tools if needed
        // 4. Save the assistant response

        // For now, just return success
        await job.updateProgress(100);

        logger.info(`Message processing job ${job.id} completed`);
        return {
          userMessageId: userMessage.id,
          processed: true,
        };
      } catch (error) {
        logger.error(`Message processing job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      concurrency: 3, // Process up to 3 messages in parallel
    }
  );

  logger.info('Message processing queue initialized');
}

export async function queueMessageProcessing(data: MessageProcessingJobData): Promise<string> {
  const job = await queueManager.addJob(QUEUE_NAME, data, {
    trackInDb: true,
  });
  
  return job.id;
}

export async function getMessageProcessingQueueStats() {
  return queueManager.getQueueStats(QUEUE_NAME);
}