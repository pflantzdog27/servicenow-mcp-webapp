import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { createLogger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = createLogger();

export interface ActivityLog {
  timestamp: Date;
  operations: Array<{
    tool: string;
    arguments: any;
    success: boolean;
    result?: any;
  }>;
}

export interface ActivityStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  toolsUsed: string[];
  operationsToday: number;
  operationsThisWeek: number;
}

export class ActivityService {
  async createToolExecution(
    messageId: string,
    toolName: string,
    arguments_: any,
    status: ToolExecutionStatus = ToolExecutionStatus.QUEUED
  ) {
    try {
      const toolExecution = await prisma.toolExecution.create({
        data: {
          messageId,
          toolName,
          arguments: JSON.stringify(arguments_),
          status
        }
      });

      logger.info(`Created tool execution: ${toolExecution.id} for tool: ${toolName}`);
      return toolExecution;
    } catch (error) {
      logger.error('Error creating tool execution:', error);
      throw error;
    }
  }

  async updateToolExecution(
    id: string,
    status: ToolExecutionStatus,
    result?: any,
    error?: string
  ) {
    try {
      const toolExecution = await prisma.toolExecution.update({
        where: { id },
        data: {
          status,
          result: result ? JSON.stringify(result) : null,
          error,
          updatedAt: new Date()
        }
      });

      logger.info(`Updated tool execution: ${id} with status: ${status}`);
      return toolExecution;
    } catch (error) {
      logger.error('Error updating tool execution:', error);
      throw error;
    }
  }

  async getUserActivity(userId: string, limit: number = 100, offset: number = 0): Promise<ActivityLog[]> {
    try {
      // Get tool executions grouped by message
      const toolExecutions = await prisma.toolExecution.findMany({
        where: {
          message: {
            session: {
              userId
            }
          }
        },
        include: {
          message: {
            select: {
              createdAt: true,
              sessionId: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit * 10, // Get more records to group properly
        skip: offset
      });

      // Group by message/timestamp
      const groupedActivities: Map<string, ActivityLog> = new Map();

      for (const execution of toolExecutions) {
        const key = `${execution.messageId}-${execution.message.createdAt.toISOString()}`;
        
        if (!groupedActivities.has(key)) {
          groupedActivities.set(key, {
            timestamp: execution.message.createdAt,
            operations: []
          });
        }

        const activity = groupedActivities.get(key)!;
        activity.operations.push({
          tool: execution.toolName,
          arguments: execution.arguments ? JSON.parse(execution.arguments) : {},
          success: execution.status === ToolExecutionStatus.COMPLETED,
          result: execution.result ? JSON.parse(execution.result) : null
        });
      }

      // Convert to array and limit results
      return Array.from(groupedActivities.values())
        .slice(0, limit);

    } catch (error) {
      logger.error('Error getting user activity:', error);
      throw error;
    }
  }

  async getUserActivityStats(userId: string): Promise<ActivityStats> {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

      // Get all tool executions for the user
      const allExecutions = await prisma.toolExecution.findMany({
        where: {
          message: {
            session: {
              userId
            }
          }
        },
        select: {
          toolName: true,
          status: true,
          createdAt: true
        }
      });

      const totalOperations = allExecutions.length;
      const successfulOperations = allExecutions.filter(
        e => e.status === ToolExecutionStatus.COMPLETED
      ).length;
      const failedOperations = allExecutions.filter(
        e => e.status === ToolExecutionStatus.FAILED
      ).length;

      const toolsUsed = [...new Set(allExecutions.map(e => e.toolName))];

      const operationsToday = allExecutions.filter(
        e => e.createdAt >= startOfToday
      ).length;

      const operationsThisWeek = allExecutions.filter(
        e => e.createdAt >= startOfWeek
      ).length;

      return {
        totalOperations,
        successfulOperations,
        failedOperations,
        toolsUsed,
        operationsToday,
        operationsThisWeek
      };

    } catch (error) {
      logger.error('Error getting user activity stats:', error);
      throw error;
    }
  }
}