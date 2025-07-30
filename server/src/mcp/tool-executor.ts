import { MCPToolCall, MCPToolResult, MCPClientManager } from './mcp-client';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface QueuedRequest {
  id: string;
  toolCall: MCPToolCall;
  resolve: (result: MCPToolResult) => void;
  reject: (error: Error) => void;
  timestamp: Date;
  retryCount: number;
}

export class ToolExecutor {
  private mcpClient: MCPClientManager;
  private requestQueue: QueuedRequest[] = [];
  private isProcessing = false;
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor(mcpClient: MCPClientManager) {
    this.mcpClient = mcpClient;
  }

  async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: Date.now().toString(),
        toolCall,
        resolve,
        reject,
        timestamp: new Date(),
        retryCount: 0
      };

      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) continue;

      try {
        logger.info(`Executing queued tool: ${request.toolCall.name}`, {
          requestId: request.id,
          queueLength: this.requestQueue.length
        });

        const result = await this.mcpClient.executeTool(request.toolCall);
        request.resolve(result);

      } catch (error) {
        logger.error(`Tool execution failed: ${request.toolCall.name}`, {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          retryCount: request.retryCount
        });

        if (request.retryCount < this.maxRetries) {
          // Retry the request
          request.retryCount++;
          logger.info(`Retrying tool execution: ${request.toolCall.name}`, {
            requestId: request.id,
            retryCount: request.retryCount
          });

          // Add delay before retry
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * request.retryCount));
          this.requestQueue.unshift(request); // Add back to front of queue
        } else {
          request.reject(error instanceof Error ? error : new Error('Tool execution failed'));
        }
      }
    }

    this.isProcessing = false;
  }

  getQueueStatus(): { length: number; isProcessing: boolean } {
    return {
      length: this.requestQueue.length,
      isProcessing: this.isProcessing
    };
  }

  clearQueue(): void {
    const remainingRequests = this.requestQueue.splice(0);
    remainingRequests.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    logger.info(`Cleared ${remainingRequests.length} queued requests`);
  }
}