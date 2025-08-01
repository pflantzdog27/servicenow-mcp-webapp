import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger';

const logger = createLogger();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  apiKey?: {
    id: string;
    name: string;
  };
}

// JWT Token generation
export function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Verify JWT Token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compare password
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT Authentication Middleware
export async function authenticateJWT(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = verifyToken(token);
    
    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        lockedUntil: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(403).json({ 
        error: 'Account locked',
        lockedUntil: user.lockedUntil,
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

// API Key Authentication Middleware
export async function authenticateAPIKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({ error: 'No API key provided' });
      return;
    }

    // Find API key and associated user
    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!key || !key.isActive) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Check if key is expired
    if (key.expiresAt && key.expiresAt < new Date()) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }

    // Check if user is active
    if (!key.user.isActive) {
      res.status(401).json({ error: 'User account inactive' });
      return;
    }

    req.user = {
      id: key.user.id,
      email: key.user.email,
      role: key.user.role,
    };

    req.apiKey = {
      id: key.id,
      name: key.name,
    };

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsed: new Date() },
    });

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Combined authentication (JWT or API Key)
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  if (authHeader) {
    return authenticateJWT(req, res, next);
  } else if (apiKey) {
    return authenticateAPIKey(req, res, next);
  } else {
    res.status(401).json({ error: 'No authentication provided' });
  }
}

// Role-based authorization middleware
export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

// Login attempt tracking
export async function trackLoginAttempt(
  email: string,
  success: boolean
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) return;

    if (success) {
      // Reset failed attempts on successful login
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } else {
      // Increment failed attempts
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const maxAttempts = 5;
      const lockDuration = 15 * 60 * 1000; // 15 minutes

      const updateData: any = {
        failedLoginAttempts: newFailedAttempts,
      };

      // Lock account if max attempts exceeded
      if (newFailedAttempts >= maxAttempts) {
        updateData.lockedUntil = new Date(Date.now() + lockDuration);
        logger.warn(`Account locked for user ${email} after ${newFailedAttempts} failed attempts`);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }
  } catch (error) {
    logger.error('Error tracking login attempt:', error);
  }
}