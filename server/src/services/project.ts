import { PrismaClient, Project, Document } from '@prisma/client';
import { createLogger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = createLogger();

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export class ProjectService {
  async createProject(userId: string, data: CreateProjectData): Promise<Project> {
    try {
      const project = await prisma.project.create({
        data: {
          userId,
          name: data.name,
          description: data.description,
        },
      });
      
      logger.info(`Project created: ${project.name} by user ${userId}`);
      return project;
    } catch (error) {
      logger.error('Error creating project:', error);
      throw new Error('Failed to create project');
    }
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    try {
      const projects = await prisma.project.findMany({
        where: { userId },
        include: {
          documents: {
            select: {
              id: true,
              filename: true,
              processingStatus: true,
              createdAt: true,
            },
          },
          chatSessions: {
            select: {
              id: true,
              title: true,
              createdAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 5, // Recent sessions
          },
          _count: {
            select: {
              documents: true,
              chatSessions: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return projects;
    } catch (error) {
      logger.error('Error fetching user projects:', error);
      throw new Error('Failed to fetch projects');
    }
  }

  async getProject(projectId: string, userId: string): Promise<Project | null> {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
        },
        include: {
          documents: {
            orderBy: { createdAt: 'desc' },
          },
          chatSessions: {
            select: {
              id: true,
              title: true,
              createdAt: true,
              updatedAt: true,
              _count: {
                select: {
                  messages: true,
                },
              },
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      });

      return project;
    } catch (error) {
      logger.error('Error fetching project:', error);
      throw new Error('Failed to fetch project');
    }
  }

  async updateProject(
    projectId: string,
    userId: string,
    data: UpdateProjectData
  ): Promise<Project> {
    try {
      const project = await prisma.project.update({
        where: {
          id: projectId,
          userId,
        },
        data: {
          name: data.name,
          description: data.description,
          updatedAt: new Date(),
        },
      });

      logger.info(`Project updated: ${project.name} by user ${userId}`);
      return project;
    } catch (error) {
      logger.error('Error updating project:', error);
      throw new Error('Failed to update project');
    }
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    try {
      await prisma.project.delete({
        where: {
          id: projectId,
          userId,
        },
      });

      logger.info(`Project deleted: ${projectId} by user ${userId}`);
    } catch (error) {
      logger.error('Error deleting project:', error);
      throw new Error('Failed to delete project');
    }
  }

  async createDefaultProject(userId: string): Promise<Project> {
    try {
      const existingDefault = await prisma.project.findFirst({
        where: {
          userId,
          name: 'General Workspace',
        },
      });

      if (existingDefault) {
        return existingDefault;
      }

      return await this.createProject(userId, {
        name: 'General Workspace',
        description: 'Default workspace for general conversations and ServiceNow operations',
      });
    } catch (error) {
      logger.error('Error creating default project:', error);
      throw new Error('Failed to create default project');
    }
  }
}

export const projectService = new ProjectService();