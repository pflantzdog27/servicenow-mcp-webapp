import { PrismaClient, Document, DocumentChunk, ProcessingStatus } from '@prisma/client';
import { createLogger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const logger = createLogger();

export interface UploadDocumentData {
  originalName: string;
  contentType: string;
  fileSize: number;
  buffer: Buffer;
}

export interface DocumentChunkData {
  content: string;
  chunkIndex: number;
  embedding?: number[];
}

export class DocumentService {
  private uploadsDir = path.join(process.cwd(), 'uploads');

  constructor() {
    this.ensureUploadsDir();
  }

  private async ensureUploadsDir(): Promise<void> {
    try {
      await fs.access(this.uploadsDir);
    } catch {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      logger.info('Created uploads directory');
    }
  }

  async uploadDocument(
    projectId: string,
    userId: string,
    data: UploadDocumentData
  ): Promise<Document> {
    try {
      // Verify user owns the project
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new Error('Project not found or access denied');
      }

      // Generate unique filename
      const fileExtension = path.extname(data.originalName);
      const filename = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.uploadsDir, filename);

      // Save file to disk
      await fs.writeFile(filePath, data.buffer);

      // Create document record
      const document = await prisma.document.create({
        data: {
          projectId,
          filename,
          originalName: data.originalName,
          contentType: data.contentType,
          fileSize: data.fileSize,
          processingStatus: ProcessingStatus.UPLOADING,
        },
      });

      logger.info(`Document uploaded: ${data.originalName} to project ${projectId}`);

      // Start processing in background
      this.processDocumentAsync(document.id, filePath);

      return document;
    } catch (error) {
      logger.error('Error uploading document:', error);
      throw error;
    }
  }

  private async processDocumentAsync(documentId: string, filePath: string): Promise<void> {
    try {
      // Update status to processing
      await prisma.document.update({
        where: { id: documentId },
        data: { processingStatus: ProcessingStatus.PROCESSING },
      });

      // Extract text content
      const content = await this.extractTextContent(filePath);

      // Split into chunks
      const chunks = await this.splitIntoChunks(content);

      // Save chunks to database
      const chunkPromises = chunks.map((chunk, index) =>
        prisma.documentChunk.create({
          data: {
            documentId,
            content: chunk.content,
            chunkIndex: index,
            // We'll add embeddings later
          },
        })
      );

      await Promise.all(chunkPromises);

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: {
          content,
          chunkCount: chunks.length,
          processingStatus: ProcessingStatus.COMPLETED,
        },
      });

      logger.info(`Document processed successfully: ${documentId}`);
    } catch (error) {
      logger.error(`Error processing document ${documentId}:`, error);

      // Update status to failed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: ProcessingStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  private async extractTextContent(filePath: string): Promise<string> {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();

      switch (fileExtension) {
        case '.txt':
        case '.md':
          return await fs.readFile(filePath, 'utf-8');
        
        case '.json':
          const jsonContent = await fs.readFile(filePath, 'utf-8');
          return JSON.stringify(JSON.parse(jsonContent), null, 2);
        
        // TODO: Add support for PDF, DOCX, etc.
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } catch (error) {
      logger.error('Error extracting text content:', error);
      throw new Error('Failed to extract content from file');
    }
  }

  private async splitIntoChunks(content: string): Promise<DocumentChunkData[]> {
    // Simple text splitting - we'll enhance this later
    const chunkSize = 1000; // characters
    const overlap = 200; // character overlap between chunks
    
    const chunks: DocumentChunkData[] = [];
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      let chunkContent = content.slice(start, end);

      // Try to break at sentence boundaries
      if (end < content.length) {
        const lastPeriod = chunkContent.lastIndexOf('.');
        const lastNewline = chunkContent.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);
        
        if (breakPoint > chunkSize * 0.5) { // Don't break too early
          chunkContent = chunkContent.slice(0, breakPoint + 1);
        }
      }

      chunks.push({
        content: chunkContent.trim(),
        chunkIndex: chunks.length,
      });

      start += chunkContent.length - overlap;
    }

    return chunks.filter(chunk => chunk.content.length > 0);
  }

  async getProjectDocuments(projectId: string, userId: string): Promise<Document[]> {
    try {
      // Verify user owns the project
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new Error('Project not found or access denied');
      }

      const documents = await prisma.document.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              chunks: true,
            },
          },
        },
      });

      return documents;
    } catch (error) {
      logger.error('Error fetching project documents:', error);
      throw error;
    }
  }

  async deleteDocument(documentId: string, userId: string): Promise<void> {
    try {
      // Verify user owns the document through project
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          project: { userId },
        },
      });

      if (!document) {
        throw new Error('Document not found or access denied');
      }

      // Delete file from disk
      try {
        const filePath = path.join(this.uploadsDir, document.filename);
        await fs.unlink(filePath);
      } catch (fileError) {
        logger.warn(`Could not delete file ${document.filename}:`, fileError);
      }

      // Delete from database (cascades to chunks)
      await prisma.document.delete({
        where: { id: documentId },
      });

      logger.info(`Document deleted: ${documentId}`);
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  async searchSimilarContent(
    query: string,
    projectId: string,
    userId: string,
    limit: number = 5
  ): Promise<DocumentChunk[]> {
    try {
      // Verify user owns the project
      const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
      });

      if (!project) {
        throw new Error('Project not found or access denied');
      }

      // For now, do simple text search
      // TODO: Implement proper vector similarity search
      const chunks = await prisma.documentChunk.findMany({
        where: {
          document: { projectId },
          content: {
            contains: query,
          },
        },
        include: {
          document: {
            select: {
              originalName: true,
              contentType: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return chunks;
    } catch (error) {
      logger.error('Error searching content:', error);
      throw error;
    }
  }
}

export const documentService = new DocumentService();