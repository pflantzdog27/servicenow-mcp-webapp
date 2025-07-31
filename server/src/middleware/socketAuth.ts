import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email: string;
  };
}

export const authenticateSocket = (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    socket.user = {
      userId: decoded.userId,
      email: decoded.email
    };

    logger.info(`Socket authenticated for user: ${socket.user.email} (${socket.user.userId})`);
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Invalid authentication token'));
  }
};