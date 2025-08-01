import { Queue, Worker, QueueEvents, Job, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const logger = createLogger();
const prisma = new PrismaClient();

// Redis connection configuration
const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export interface QueueConfig {
  defaultJobOptions?: {
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    attempts?: number;
    backoff?: {
      type: string;
      delay: number;
    };
  };
  workerOptions?: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  };
}

export class QueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private redisClient: IORedis;

  constructor() {
    this.redisClient = new IORedis(redisConnection);
  }

  createQueue(name: string, config?: QueueConfig): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...config?.defaultJobOptions,
      },
    });

    this.queues.set(name, queue);
    
    // Create queue events listener
    const queueEvents = new QueueEvents(name, { connection: redisConnection });
    this.queueEvents.set(name, queueEvents);

    this.setupQueueEventListeners(name, queueEvents);

    logger.info(`Created queue: ${name}`);
    return queue;
  }

  createWorker(
    name: string, 
    processor: (job: Job) => Promise<any>,
    config?: QueueConfig['workerOptions']
  ): Worker {
    if (this.workers.has(name)) {
      throw new Error(`Worker for queue ${name} already exists`);
    }

    const worker = new Worker(name, processor, {
      connection: redisConnection,
      concurrency: config?.concurrency || 5,
      limiter: config?.limiter,
    });

    this.workers.set(name, worker);
    this.setupWorkerEventListeners(name, worker);

    logger.info(`Created worker for queue: ${name}`);
    return worker;
  }

  private setupQueueEventListeners(name: string, queueEvents: QueueEvents) {
    queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      logger.debug(`Job ${jobId} completed in queue ${name}`);
      
      // Update database if this is a tracked job
      try {
        const job = await this.getJob(name, jobId);
        if (job?.data?.trackingId) {
          await prisma.queuedJob.updateMany({
            where: { id: job.data.trackingId },
            data: {
              status: 'COMPLETED',
              result: returnvalue as any,
              completedAt: new Date(),
            },
          });
        }
      } catch (error) {
        logger.error(`Failed to update job tracking for ${jobId}:`, error);
      }
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed in queue ${name}: ${failedReason}`);
      
      // Update database if this is a tracked job
      try {
        const job = await this.getJob(name, jobId);
        if (job?.data?.trackingId) {
          await prisma.queuedJob.updateMany({
            where: { id: job.data.trackingId },
            data: {
              status: 'FAILED',
              error: failedReason,
              completedAt: new Date(),
            },
          });
        }
      } catch (error) {
        logger.error(`Failed to update job tracking for ${jobId}:`, error);
      }
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job ${jobId} progress in queue ${name}:`, data);
    });
  }

  private setupWorkerEventListeners(name: string, worker: Worker) {
    worker.on('completed', (job) => {
      logger.info(`Worker completed job ${job.id} in queue ${name}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Worker failed job ${job?.id} in queue ${name}:`, err);
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in queue ${name}:`, err);
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Job ${jobId} stalled in queue ${name}`);
    });
  }

  async addJob(
    queueName: string, 
    data: any, 
    options?: {
      priority?: number;
      delay?: number;
      trackInDb?: boolean;
    }
  ): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    // Track in database if requested
    let trackingId: string | undefined;
    if (options?.trackInDb) {
      const queuedJob = await prisma.queuedJob.create({
        data: {
          queue: queueName,
          payload: data as any,
          priority: options.priority || 0,
          status: 'PENDING',
        },
      });
      trackingId = queuedJob.id;
    }

    const job = await queue.add('job', {
      ...data,
      trackingId,
    }, {
      priority: options?.priority,
      delay: options?.delay,
    });

    logger.info(`Added job ${job.id} to queue ${queueName}`);
    return job;
  }

  async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return queue.getJob(jobId);
  }

  async getQueueStats(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.getPausedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + delayed + paused,
    };
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Paused queue: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Resumed queue: ${queueName}`);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down queue manager');

    // Close all workers first
    const workerClosePromises = Array.from(this.workers.entries()).map(
      async ([name, worker]) => {
        logger.info(`Closing worker for queue: ${name}`);
        await worker.close();
      }
    );
    await Promise.all(workerClosePromises);

    // Close all queue events
    const queueEventsClosePromises = Array.from(this.queueEvents.entries()).map(
      async ([name, queueEvents]) => {
        logger.info(`Closing queue events for: ${name}`);
        await queueEvents.close();
      }
    );
    await Promise.all(queueEventsClosePromises);

    // Close all queues
    const queueClosePromises = Array.from(this.queues.entries()).map(
      async ([name, queue]) => {
        logger.info(`Closing queue: ${name}`);
        await queue.close();
      }
    );
    await Promise.all(queueClosePromises);

    // Close Redis connection
    this.redisClient.disconnect();

    logger.info('Queue manager shutdown complete');
  }

  getAllQueues(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Singleton instance
let queueManagerInstance: QueueManager | null = null;

export function getQueueManager(): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager();
  }
  return queueManagerInstance;
}