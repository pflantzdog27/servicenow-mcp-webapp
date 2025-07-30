import { Socket } from 'socket.io';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface StreamMessage {
  id: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  metadata?: any;
}

export class StreamHandler {
  private activeStreams: Map<string, boolean> = new Map();

  startStream(socket: Socket, streamId: string): void {
    this.activeStreams.set(streamId, true);
    socket.emit('stream:start', { streamId });
    logger.info(`Started stream: ${streamId}`);
  }

  sendStreamChunk(socket: Socket, streamId: string, message: StreamMessage): void {
    if (!this.activeStreams.get(streamId)) {
      logger.warn(`Attempted to send chunk to inactive stream: ${streamId}`);
      return;
    }

    socket.emit('stream:chunk', {
      streamId,
      ...message
    });
  }

  endStream(socket: Socket, streamId: string): void {
    this.activeStreams.delete(streamId);
    socket.emit('stream:end', { streamId });
    logger.info(`Ended stream: ${streamId}`);
  }

  isStreamActive(streamId: string): boolean {
    return this.activeStreams.get(streamId) || false;
  }

  cleanup(socketId: string): void {
    // Clean up any streams associated with this socket
    const streamsToRemove: string[] = [];
    
    for (const [streamId, active] of this.activeStreams.entries()) {
      if (streamId.startsWith(socketId)) {
        streamsToRemove.push(streamId);
      }
    }

    streamsToRemove.forEach(streamId => {
      this.activeStreams.delete(streamId);
    });

    if (streamsToRemove.length > 0) {
      logger.info(`Cleaned up ${streamsToRemove.length} streams for socket: ${socketId}`);
    }
  }
}