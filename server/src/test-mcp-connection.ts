import dotenv from 'dotenv';
import { getEnhancedMCPClient } from './mcp/enhanced-mcp-client';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger();

async function testMCPConnection() {
  logger.info('=== Testing MCP Connection ===');
  
  // Check environment variables
  const mcpPath = process.env.SERVICENOW_MCP_PATH;
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
  const username = process.env.SERVICENOW_USERNAME;
  
  logger.info('Environment Check:', {
    mcpPath: mcpPath ? `Set (${mcpPath})` : 'NOT SET',
    instanceUrl: instanceUrl ? `Set (${instanceUrl})` : 'NOT SET',
    username: username ? 'Set' : 'NOT SET',
    password: process.env.SERVICENOW_PASSWORD ? 'Set' : 'NOT SET'
  });

  if (!mcpPath) {
    logger.error('SERVICENOW_MCP_PATH is not set in .env file!');
    return;
  }

  try {
    // Initialize MCP client
    logger.info('Initializing MCP client...');
    const mcpClient = getEnhancedMCPClient();
    await mcpClient.initialize();
    
    // Check if client is ready
    const isReady = mcpClient.isReady();
    const poolStats = mcpClient.getPoolStats();
    
    logger.info('MCP Client Status:', {
      ready: isReady,
      poolStats
    });
    
    // Get available tools
    const tools = mcpClient.getAvailableTools();
    logger.info(`Available tools: ${tools.length}`);
    tools.forEach(tool => {
      logger.info(`  - ${tool.name}: ${tool.description || 'No description'}`);
    });
    
    // Test a simple tool execution
    if (tools.length > 0) {
      logger.info('\n=== Testing Tool Execution ===');
      
      // Find a simple read tool
      const listTool = tools.find(t => t.name.includes('list') || t.name.includes('get'));
      
      if (listTool) {
        logger.info(`Testing tool: ${listTool.name}`);
        
        const result = await mcpClient.executeTool({
          name: listTool.name,
          arguments: {
            sysparm_limit: '1'
          }
        });
        
        logger.info('Tool execution result:', result);
      }
    }
    
    // Disconnect
    await mcpClient.disconnect();
    logger.info('MCP client disconnected successfully');
    
  } catch (error) {
    logger.error('Error during MCP connection test:', error);
  }
  
  process.exit(0);
}

// Run the test
testMCPConnection();