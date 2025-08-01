import { getQueueManager } from './queue-manager';
import { initializeToolExecutionQueue } from './tool-execution-queue';
import { initializeMessageProcessingQueue } from './message-processing-queue';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export async function initializeQueues() {
  logger.info('Initializing message queues');
  
  try {
    // Initialize specific queues
    initializeToolExecutionQueue();
    initializeMessageProcessingQueue();
    
    logger.info('All queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queues:', error);
    throw error;
  }
}

export async function shutdownQueues() {
  logger.info('Shutting down message queues');
  
  try {
    const queueManager = getQueueManager();
    await queueManager.shutdown();
    
    logger.info('All queues shut down successfully');
  } catch (error) {
    logger.error('Error shutting down queues:', error);
    throw error;
  }
}

export * from './queue-manager';
export * from './tool-execution-queue';
export * from './message-processing-queue';