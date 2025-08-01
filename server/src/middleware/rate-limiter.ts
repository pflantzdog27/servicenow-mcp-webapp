import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger';
import IORedis from 'ioredis';

const logger = createLogger();
const prisma = new PrismaClient();

// Redis client for distributed rate limiting
const redis = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

// Custom rate limit store using Redis for distributed systems
class RedisRateLimitStore {
  private prefix: string;
  private windowMs: number;

  constructor(prefix: string, windowMs: number) {
    this.prefix = prefix;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redisKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const resetTime = new Date(now + this.windowMs);

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, Math.ceil(this.windowMs / 1000));
    
    const results = await pipeline.exec();
    const totalHits = results?.[0]?.[1] as number || 1;

    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    await redis.decr(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}:${key}`;
    await redis.del(redisKey);
  }
}

// Database-backed rate limit tracking for analytics
async function trackRateLimit(
  userId: string | null,
  ip: string | null,
  endpoint: string
): Promise<void> {
  try {
    const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000); // Round to minute

    if (userId) {
      await prisma.rateLimitRecord.upsert({
        where: {
          userId_endpoint_windowStart: {
            userId,
            endpoint,
            windowStart,
          },
        },
        update: {
          count: { increment: 1 },
        },
        create: {
          userId,
          endpoint,
          windowStart,
          count: 1,
        },
      });
    } else if (ip) {
      await prisma.rateLimitRecord.upsert({
        where: {
          ip_endpoint_windowStart: {
            ip,
            endpoint,
            windowStart,
          },
        },
        update: {
          count: { increment: 1 },
        },
        create: {
          ip,
          endpoint,
          windowStart,
          count: 1,
        },
      });
    }
  } catch (error) {
    logger.error('Error tracking rate limit:', error);
  }
}

// Global rate limiter (for all requests)
export const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore('global', parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000')),
});

// API endpoint rate limiter (stricter)
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'API rate limit exceeded, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore('api', 60 * 1000),
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    const authReq = req as any;
    return authReq.user?.id || req.ip;
  },
});

// Auth endpoint rate limiter (very strict for security)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore('auth', 15 * 60 * 1000),
  skipSuccessfulRequests: true, // Don't count successful logins
});

// Tool execution rate limiter
export const toolExecutionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: 'Too many tool executions, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisRateLimitStore('tools', 60 * 1000),
  keyGenerator: (req: Request) => {
    const authReq = req as any;
    return authReq.user?.id || req.ip;
  },
});

// Custom rate limiter factory
export function createRateLimiter(
  name: string,
  options: RateLimitOptions = {}
): any {
  const windowMs = options.windowMs || 60 * 1000;
  
  return rateLimit({
    windowMs,
    max: options.max || 60,
    message: options.message || 'Rate limit exceeded',
    standardHeaders: options.standardHeaders !== false,
    legacyHeaders: options.legacyHeaders || false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    store: new RedisRateLimitStore(name, windowMs),
    keyGenerator: options.keyGenerator || ((req: Request) => {
      const authReq = req as any;
      return authReq.user?.id || req.ip;
    }),
    handler: async (req: Request, res: Response) => {
      const authReq = req as any;
      const userId = authReq.user?.id || null;
      const ip = req.ip || null;
      const endpoint = req.path;

      // Track in database for analytics
      await trackRateLimit(userId, ip, endpoint);

      res.status(429).json({
        error: options.message || 'Rate limit exceeded',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  });
}

// WebSocket rate limiting middleware
export class WebSocketRateLimiter {
  private limits: Map<string, { count: number; resetTime: number }> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 60, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up old entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, limit] of this.limits.entries()) {
        if (limit.resetTime < now) {
          this.limits.delete(key);
        }
      }
    }, this.windowMs);
  }

  async checkLimit(userId: string): Promise<boolean> {
    const now = Date.now();
    const userLimit = this.limits.get(userId);

    if (!userLimit || userLimit.resetTime < now) {
      // New window
      this.limits.set(userId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (userLimit.count >= this.maxRequests) {
      logger.warn(`WebSocket rate limit exceeded for user ${userId}`);
      return false;
    }

    userLimit.count++;
    return true;
  }

  resetUser(userId: string): void {
    this.limits.delete(userId);
  }
}

// Middleware to add rate limit info to response headers
export function addRateLimitHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    // Add custom rate limit headers
    const remaining = res.getHeader('X-RateLimit-Remaining');
    if (remaining !== undefined) {
      res.setHeader('X-RateLimit-Policy', 'sliding-window');
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

// Export Redis client for cleanup
export const rateLimitRedis = redis;