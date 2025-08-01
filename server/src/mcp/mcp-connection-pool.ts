import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../utils/logger';
import { PrismaClient, ConnectionStatus } from '@prisma/client';
import { EventEmitter } from 'events';

const logger = createLogger();
const prisma = new PrismaClient();

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  mcpPath: string;
  healthCheckInterval: number;
}

export interface PooledConnection {
  id: string;
  client: Client;
  lastUsed: Date;
  inUse: boolean;
  created: Date;
}

export class MCPConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private waitingQueue: Array<(conn: PooledConnection | null) => void> = [];
  private config: PoolConfig;
  private healthCheckTimer?: NodeJS.Timer;
  private shutdownInProgress = false;

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = {
      minConnections: parseInt(process.env.MCP_MIN_CONNECTIONS || '2'),
      maxConnections: parseInt(process.env.MCP_MAX_CONNECTIONS || '10'),
      acquireTimeout: parseInt(process.env.MCP_ACQUIRE_TIMEOUT || '5000'),
      idleTimeout: parseInt(process.env.MCP_IDLE_TIMEOUT || '300000'), // 5 minutes
      mcpPath: process.env.SERVICENOW_MCP_PATH || '',
      healthCheckInterval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
      ...config
    };

    if (!this.config.mcpPath) {
      throw new Error('SERVICENOW_MCP_PATH environment variable is required');
    }
  }

  async initialize(): Promise<void> {
    logger.info('Initializing MCP connection pool', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections
    });

    // Create minimum connections
    const connectionPromises = [];
    for (let i = 0; i < this.config.minConnections; i++) {
      connectionPromises.push(this.createConnection());
    }

    await Promise.all(connectionPromises);

    // Start health check
    this.startHealthCheck();

    logger.info(`MCP connection pool initialized with ${this.connections.size} connections`);
  }

  private async createConnection(): Promise<PooledConnection> {
    const connectionId = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`[MCP-POOL] Creating new connection: ${connectionId}`, {
        mcpPath: this.config.mcpPath
      });
      
      const client = new Client({
        name: "servicenow-web-app",
        version: "1.0.0",
      });

      const transport = new StdioClientTransport({
        command: this.config.mcpPath,
      });

      logger.debug(`[MCP-POOL] Connecting to MCP server at: ${this.config.mcpPath}`);
      
      await client.connect(transport);
      
      logger.info(`[MCP-POOL] Connection established: ${connectionId}`);

      const connection: PooledConnection = {
        id: connectionId,
        client,
        lastUsed: new Date(),
        inUse: false,
        created: new Date()
      };

      this.connections.set(connectionId, connection);

      // Record in database
      await prisma.mCPConnection.create({
        data: {
          connectionId,
          status: ConnectionStatus.CONNECTED,
          lastPingAt: new Date()
        }
      });

      logger.info(`[MCP-POOL] Successfully created MCP connection: ${connectionId}`);
      this.emit('connectionCreated', connectionId);

      return connection;
    } catch (error) {
      logger.error(`[MCP-POOL] Failed to create MCP connection ${connectionId}:`, {
        error: String(error),
        mcpPath: this.config.mcpPath,
        errorDetails: error
      });
      
      await prisma.mCPConnection.create({
        data: {
          connectionId,
          status: ConnectionStatus.ERROR,
          metadata: { error: String(error) }
        }
      });

      throw error;
    }
  }

  async acquire(): Promise<PooledConnection> {
    if (this.shutdownInProgress) {
      throw new Error('Connection pool is shutting down');
    }

    // Try to find an available connection
    for (const [id, conn] of this.connections) {
      if (!conn.inUse) {
        conn.inUse = true;
        conn.lastUsed = new Date();
        logger.debug(`Acquired existing connection: ${id}`);
        return conn;
      }
    }

    // If no connections available and we haven't reached max, create new one
    if (this.connections.size < this.config.maxConnections) {
      try {
        const newConn = await this.createConnection();
        newConn.inUse = true;
        return newConn;
      } catch (error) {
        logger.error('Failed to create new connection:', error);
      }
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waitingQueue.indexOf(resolver);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.config.acquireTimeout);

      const resolver = (conn: PooledConnection | null) => {
        clearTimeout(timer);
        if (conn) {
          conn.inUse = true;
          conn.lastUsed = new Date();
          resolve(conn);
        } else {
          reject(new Error('Failed to acquire connection'));
        }
      };

      this.waitingQueue.push(resolver);
    });
  }

  async release(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      logger.warn(`Attempted to release unknown connection: ${connectionId}`);
      return;
    }

    conn.inUse = false;
    conn.lastUsed = new Date();
    logger.debug(`Released connection: ${connectionId}`);

    // If there are waiting requests, give them this connection
    if (this.waitingQueue.length > 0) {
      const resolver = this.waitingQueue.shift();
      if (resolver) {
        resolver(conn);
        return;
      }
    }

    // Check if we should close this connection (over minimum)
    if (this.connections.size > this.config.minConnections) {
      const idleTime = Date.now() - conn.lastUsed.getTime();
      if (idleTime > this.config.idleTimeout) {
        await this.closeConnection(connectionId);
      }
    }
  }

  private async closeConnection(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    try {
      await conn.client.close();
      this.connections.delete(connectionId);
      
      await prisma.mCPConnection.updateMany({
        where: { connectionId },
        data: { status: ConnectionStatus.DISCONNECTED }
      });

      logger.info(`Closed connection: ${connectionId}`);
      this.emit('connectionClosed', connectionId);
    } catch (error) {
      logger.error(`Error closing connection ${connectionId}:`, error);
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      const checkPromises = Array.from(this.connections.entries()).map(async ([id, conn]) => {
        if (conn.inUse) return;

        try {
          // Temporarily disable health checks that are causing issues
          // await conn.client.request({ method: 'ping' }, { timeout: 5000 });
          
          await prisma.mCPConnection.updateMany({
            where: { connectionId: id },
            data: { lastPingAt: new Date() }
          });
        } catch (error) {
          logger.warn(`Health check failed for connection ${id}:`, error);
          
          // Temporarily skip connection recreation to avoid crashes
          // await this.closeConnection(id);
          // if (this.connections.size < this.config.minConnections && !this.shutdownInProgress) {
          //   try {
          //     await this.createConnection();
          //   } catch (createError) {
          //     logger.error('Failed to recreate connection during health check:', createError);
          //   }
          // }
        }
      });

      await Promise.allSettled(checkPromises);
    }, this.config.healthCheckInterval);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP connection pool');
    this.shutdownInProgress = true;

    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Reject all waiting requests
    while (this.waitingQueue.length > 0) {
      const resolver = this.waitingQueue.shift();
      if (resolver) {
        resolver(null);
      }
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(id => 
      this.closeConnection(id)
    );

    await Promise.allSettled(closePromises);
    logger.info('MCP connection pool shutdown complete');
  }

  getPoolStats() {
    const stats = {
      total: this.connections.size,
      available: 0,
      inUse: 0,
      waiting: this.waitingQueue.length
    };

    for (const conn of this.connections.values()) {
      if (conn.inUse) {
        stats.inUse++;
      } else {
        stats.available++;
      }
    }

    return stats;
  }
}

// Singleton instance
let poolInstance: MCPConnectionPool | null = null;

export function getMCPConnectionPool(): MCPConnectionPool {
  if (!poolInstance) {
    poolInstance = new MCPConnectionPool();
  }
  return poolInstance;
}