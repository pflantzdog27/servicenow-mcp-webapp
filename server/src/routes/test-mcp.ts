import express from 'express';
import { MCPClientManager } from '../mcp/mcp-client';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

let mcpClientManager: MCPClientManager;

// Initialize MCP client manager
const initializeMCPClient = async () => {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
    try {
      await mcpClientManager.initialize();
      logger.info('🔗 MCP client initialized for test endpoints');
    } catch (error) {
      logger.error('❌ Failed to initialize MCP client for test endpoints:', error);
      throw error;
    }
  }
  return mcpClientManager;
};

// Test endpoint to check MCP tools
router.get('/tools', async (req, res) => {
  try {
    const client = await initializeMCPClient();
    const tools = client.getAvailableTools();
    
    logger.info('🔧 Test MCP Tools endpoint called');
    logger.info('📚 Available MCP tools:', { 
      count: tools.length,
      toolNames: tools.map(t => t.name)
    });
    
    res.json({
      success: true,
      toolCount: tools.length,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        hasInputSchema: !!tool.inputSchema
      }))
    });
  } catch (error) {
    logger.error('❌ Test MCP Tools failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint to directly execute an MCP tool
router.post('/execute/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const { arguments: args } = req.body;
    
    logger.info(`🚀 Test MCP Tool execution: ${toolName}`, { arguments: args });
    
    const client = await initializeMCPClient();
    
    // Create a simple tool call
    const toolCall = {
      id: `test-${Date.now()}`,
      name: toolName,
      arguments: args || {}
    };
    
    const startTime = Date.now();
    const result = await client.executeTool(toolCall);
    const executionTime = Date.now() - startTime;
    
    logger.info(`✅ Test MCP Tool completed: ${toolName}`, { 
      success: !result.isError,
      executionTime
    });
    
    res.json({
      success: !result.isError,
      toolName,
      arguments: args,
      result,
      executionTime
    });
  } catch (error) {
    logger.error(`❌ Test MCP Tool execution failed: ${req.params.toolName}`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint to check connection status
router.get('/status', async (req, res) => {
  try {
    const client = await initializeMCPClient();
    const tools = client.getAvailableTools();
    
    // Try a simple test connection tool if available
    const testConnectionTool = tools.find(t => t.name === 'test-connection');
    
    let connectionTest = null;
    if (testConnectionTool) {
      try {
        const testResult = await client.executeTool({
          id: `connection-test-${Date.now()}`,
          name: 'test-connection',
          arguments: {}
        });
        connectionTest = {
          success: !testResult.isError,
          result: testResult
        };
      } catch (error) {
        connectionTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    res.json({
      mcpConnected: tools.length > 0,
      toolCount: tools.length,
      hasTestConnection: !!testConnectionTool,
      connectionTest,
      servicenowInstance: process.env.SERVICENOW_INSTANCE_URL,
      mcpPath: process.env.SERVICENOW_MCP_PATH
    });
  } catch (error) {
    logger.error('❌ Test MCP Status failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;