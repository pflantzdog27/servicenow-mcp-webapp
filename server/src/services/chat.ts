import { PrismaClient, ChatSession, Message, MessageRole } from '@prisma/client';
import { createLogger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = createLogger();

export interface ChatSessionWithMessages extends ChatSession {
  messages: Message[];
  _count?: {
    messages: number;
  };
}

export interface CreateSessionData {
  title: string;
  model: string;
  projectId?: string;
}

export interface UpdateSessionData {
  title?: string;
}

export class ChatService {
  async getUserSessions(userId: string, limit: number = 50, offset: number = 0): Promise<ChatSession[]> {
    try {
      const sessions = await prisma.chatSession.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              messages: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: limit,
        skip: offset
      });

      logger.info(`Retrieved ${sessions.length} chat sessions for user: ${userId}`);
      return sessions;
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      throw error;
    }
  }

  async getSessionWithMessages(sessionId: string, userId: string): Promise<ChatSessionWithMessages | null> {
    try {
      const session = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId
        },
        include: {
          messages: {
            include: {
              toolExecutions: true
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (session) {
        logger.info(`Retrieved session ${sessionId} with ${session.messages.length} messages`);
      }

      return session;
    } catch (error) {
      logger.error('Error getting session with messages:', error);
      throw error;
    }
  }

  async createSession(userId: string, data: CreateSessionData): Promise<ChatSession> {
    try {
      const session = await prisma.chatSession.create({
        data: {
          userId,
          title: data.title,
          model: data.model,
          contextLimit: this.getContextLimit(data.model),
          projectId: data.projectId || null
        }
      });

      logger.info(`Created new chat session: ${session.id} for user: ${userId}`);
      return session;
    } catch (error) {
      logger.error('Error creating chat session:', error);
      throw error;
    }
  }

  async updateSession(sessionId: string, userId: string, data: UpdateSessionData): Promise<ChatSession | null> {
    try {
      // First verify the session belongs to the user
      const existingSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId
        }
      });

      if (!existingSession) {
        return null;
      }

      const session = await prisma.chatSession.update({
        where: { id: sessionId },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });

      logger.info(`Updated chat session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error('Error updating chat session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      // First verify the session belongs to the user
      const existingSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId
        }
      });

      if (!existingSession) {
        return false;
      }

      await prisma.chatSession.delete({
        where: { id: sessionId }
      });

      logger.info(`Deleted chat session: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting chat session:', error);
      throw error;
    }
  }

  async getCurrentSession(userId: string): Promise<ChatSession | null> {
    try {
      // Get the most recently updated session
      const session = await prisma.chatSession.findFirst({
        where: { userId },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      return session;
    } catch (error) {
      logger.error('Error getting current session:', error);
      throw error;
    }
  }

  async updateSessionTitle(sessionId: string, userId: string, title: string): Promise<ChatSession | null> {
    try {
      const session = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId
        }
      });

      if (!session) {
        return null;
      }

      // Auto-generate title from first message if not provided
      if (!title || title === 'New Chat') {
        const firstMessage = await prisma.message.findFirst({
          where: {
            sessionId: sessionId,
            role: MessageRole.USER
          },
          orderBy: {
            createdAt: 'asc'
          }
        });

        if (firstMessage) {
          title = firstMessage.content.substring(0, 50) + (firstMessage.content.length > 50 ? '...' : '');
        }
      }

      const updatedSession = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title }
      });

      return updatedSession;
    } catch (error) {
      logger.error('Error updating session title:', error);
      throw error;
    }
  }

  private getContextLimit(model: string): number {
    if (model.startsWith('gpt-4')) return 8000;
    if (model.startsWith('gpt-3.5')) return 4000;
    if (model.startsWith('o4-')) return 128000;
    if (model.startsWith('claude-')) return 200000;
    return 4000; // default
  }
}