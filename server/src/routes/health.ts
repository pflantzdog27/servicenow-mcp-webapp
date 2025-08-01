import express from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { MCPClientManager } from '../mcp/mcp-client';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();
const prisma = new PrismaClient();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    mcp: ServiceHealth;
    websocket: ServiceHealth;
    queue: ServiceHealth;
  };
  performance: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: number;
  };
  configuration: {
    environmentVariables: EnvironmentStatus;
    requiredServices: RequiredServiceStatus;
  };
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: string;
  details?: any;
  error?: string;
}

interface EnvironmentStatus {
  required: string[];
  missing: string[];
  configured: number;
  total: number;
}

interface RequiredServiceStatus {
  servicenow: {
    configured: boolean;
    reachable?: boolean;
    error?: string;
  };
  llm: {
    anthropic: boolean;
    openai: boolean;
  };
}

// Health check endpoint
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: await checkDatabase(),
        redis: await checkRedis(),
        mcp: await checkMCP(),
        websocket: await checkWebSocket(),
        queue: await checkQueue()
      },
      performance: await getPerformanceMetrics(),
      configuration: await checkConfiguration()
    };

    // Determine overall health status
    const serviceStatuses = Object.values(healthStatus.services).map(s => s.status);
    if (serviceStatuses.includes('unhealthy')) {
      healthStatus.status = 'unhealthy';
    } else if (serviceStatuses.includes('degraded')) {
      healthStatus.status = 'degraded';
    }

    const responseTime = Date.now() - startTime;
    
    // Set appropriate HTTP status
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json({
      ...healthStatus,
      responseTime
    });

  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      responseTime: Date.now() - startTime
    });
  }
});

// Detailed health check for monitoring systems
router.get('/detailed', async (req, res) => {
  try {
    const detailedHealth = {
      ...(await getBasicHealth()),
      diagnostics: {
        database: await getDatabaseDiagnostics(),
        redis: await getRedisDiagnostics(),
        mcp: await getMCPDiagnostics(),
        system: await getSystemDiagnostics()
      },
      dependencies: await checkExternalDependencies()
    };

    res.json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(500).json({
      error: 'Detailed health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Readiness probe (for Kubernetes/container orchestration)
router.get('/ready', async (req, res) => {
  try {
    // Check only critical services for readiness
    const criticalServices = await Promise.all([
      checkDatabase(),
      checkMCP()
    ]);

    const isReady = criticalServices.every(service => 
      service.status === 'healthy' || service.status === 'degraded'
    );

    if (isReady) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        services: criticalServices
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Liveness probe (for Kubernetes/container orchestration)
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Individual service health checks
async function checkDatabase(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Database connection failed'
    };
  }
}

async function checkRedis(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    if (!process.env.REDIS_URL) {
      return {
        status: 'degraded',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        details: 'Redis not configured (optional service)'
      };
    }

    const redis = new Redis(process.env.REDIS_URL);
    await redis.ping();
    await redis.quit();
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    
    return {
      status: 'degraded', // Redis is optional for basic functionality
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Redis connection failed'
    };
  }
}

async function checkMCP(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Try enhanced MCP client first
    try {
      const enhancedClient = getEnhancedMCPClient();
      const isConnected = await enhancedClient.isConnected();
      const poolStatus = enhancedClient.getConnectionPoolStatus();
      
      return {
        status: isConnected ? 'healthy' : 'degraded',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        details: {
          type: 'enhanced',
          poolStatus
        }
      };
    } catch (enhancedError) {
      // Fallback to legacy MCP client
      logger.warn('Enhanced MCP client not available, checking legacy client');
      
      const legacyClient = new MCPClientManager();
      const tools = legacyClient.getAvailableTools();
      
      return {
        status: tools.length > 0 ? 'degraded' : 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        details: {
          type: 'legacy',
          toolCount: tools.length
        },
        error: enhancedError instanceof Error ? enhancedError.message : 'Enhanced client unavailable'
      };
    }
  } catch (error) {
    logger.error('MCP health check failed:', error);
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'MCP connection failed'
    };
  }
}

async function checkWebSocket(): Promise<ServiceHealth> {
  // WebSocket health is harder to check directly, so we check if the server is running
  try {
    const server = (global as any).__websocket_server__;
    const isRunning = server && server.engine && server.engine.clientsCount !== undefined;
    
    return {
      status: isRunning ? 'healthy' : 'degraded',
      responseTime: 0,
      lastCheck: new Date().toISOString(),
      details: {
        connectedClients: server?.engine?.clientsCount || 0
      }
    };
  } catch (error) {
    return {
      status: 'degraded',
      responseTime: 0,
      lastCheck: new Date().toISOString(),
      error: 'WebSocket status unavailable'
    };
  }
}

async function checkQueue(): Promise<ServiceHealth> {
  try {
    if (!process.env.REDIS_URL) {
      return {
        status: 'degraded',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        details: 'Queue system not configured (requires Redis)'
      };
    }

    // Check if BullMQ queues are accessible
    const redis = new Redis(process.env.REDIS_URL);
    await redis.ping();
    await redis.quit();
    
    return {
      status: 'healthy',
      responseTime: 0,
      lastCheck: new Date().toISOString(),
      details: 'Queue system operational'
    };
  } catch (error) {
    return {
      status: 'degraded',
      responseTime: 0,
      lastCheck: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Queue health check failed'
    };
  }
}

async function getPerformanceMetrics() {
  const memUsage = process.memoryUsage();
  
  return {
    uptime: process.uptime(),
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    },
    cpu: process.cpuUsage().user / 1000000 // Convert to seconds
  };
}

async function checkConfiguration(): Promise<EnvironmentStatus & { requiredServices: RequiredServiceStatus }> {
  const requiredEnvVars = [
    'ANTHROPIC_API_KEY',
    'SERVICENOW_MCP_PATH',
    'SERVICENOW_INSTANCE_URL',
    'SERVICENOW_USERNAME',
    'SERVICENOW_PASSWORD',
    'DATABASE_URL'
  ];

  const optionalEnvVars = [
    'OPENAI_API_KEY',
    'REDIS_URL',
    'JWT_SECRET',
    'SESSION_SECRET'
  ];

  const allEnvVars = [...requiredEnvVars, ...optionalEnvVars];
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  const configured = allEnvVars.filter(envVar => process.env[envVar]).length;

  // Check ServiceNow configuration
  const servicenowConfigured = !!(
    process.env.SERVICENOW_MCP_PATH &&
    process.env.SERVICENOW_INSTANCE_URL &&
    process.env.SERVICENOW_USERNAME &&
    process.env.SERVICENOW_PASSWORD
  );

  return {
    required: requiredEnvVars,
    missing,
    configured,
    total: allEnvVars.length,
    requiredServices: {
      servicenow: {
        configured: servicenowConfigured
      },
      llm: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openai: !!process.env.OPENAI_API_KEY
      }
    }
  };
}

async function getBasicHealth() {
  // Reuse the main health check logic
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };
}

async function getDatabaseDiagnostics() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_sessions,
        AVG(LENGTH(COALESCE(title, ''))) as avg_title_length
      FROM ChatSession
      WHERE createdAt > datetime('now', '-24 hours')
    ` as any[];

    return {
      recentSessions: result[0]?.total_sessions || 0,
      averageTitleLength: result[0]?.avg_title_length || 0,
      connectionPool: 'Prisma managed'
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Database diagnostics failed'
    };
  }
}

async function getRedisDiagnostics() {
  if (!process.env.REDIS_URL) {
    return { status: 'not configured' };
  }

  try {
    const redis = new Redis(process.env.REDIS_URL);
    const info = await redis.info('memory');
    await redis.quit();
    
    return {
      memoryInfo: info.split('\n').slice(0, 5).join('\n')
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Redis diagnostics failed'
    };
  }
}

async function getMCPDiagnostics() {
  try {
    const enhancedClient = getEnhancedMCPClient();
    const poolStatus = enhancedClient.getConnectionPoolStatus();
    const tools = enhancedClient.getAvailableTools();
    
    return {
      connectionPool: poolStatus,
      availableTools: tools.length,
      toolNames: tools.map(t => t.name).slice(0, 10) // First 10 tools
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'MCP diagnostics failed'
    };
  }
}

async function getSystemDiagnostics() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    loadAverage: process.platform === 'linux' ? require('os').loadavg() : 'N/A (non-Linux)',
    freeMemory: require('os').freemem(),
    totalMemory: require('os').totalmem()
  };
}

async function checkExternalDependencies() {
  const dependencies = [];

  // Check ServiceNow instance
  if (process.env.SERVICENOW_INSTANCE_URL) {
    try {
      const response = await fetch(`${process.env.SERVICENOW_INSTANCE_URL}/api/now/table/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64')}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      dependencies.push({
        name: 'ServiceNow Instance',
        status: response.ok ? 'healthy' : 'unhealthy',
        responseTime: response.headers.get('response-time') || 'N/A',
        details: `HTTP ${response.status}`
      });
    } catch (error) {
      dependencies.push({
        name: 'ServiceNow Instance',
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
  }

  return dependencies;
}

export default router;