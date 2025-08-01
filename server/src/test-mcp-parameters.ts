import dotenv from 'dotenv';
import { getEnhancedMCPClient } from './mcp/enhanced-mcp-client';
import { MCPParameterTransformer } from './mcp/mcp-parameter-transformer';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger();

async function testMCPParameters() {
  logger.info('=== Testing MCP Parameter Transformation ===');
  
  try {
    // Initialize MCP client
    const mcpClient = getEnhancedMCPClient();
    await mcpClient.initialize();
    
    // Get available tools
    const tools = mcpClient.getAvailableTools();
    logger.info(`Available tools: ${tools.length}`);
    
    // Find the catalog item creation tool
    const catalogTool = tools.find(t => t.name === 'servicenow-mcp:create-catalog-item');
    if (!catalogTool) {
      logger.error('create-catalog-item tool not found!');
      logger.info('Available tools:', tools.map(t => t.name));
      return;
    }
    
    logger.info('Found catalog item tool:', {
      name: catalogTool.name,
      description: catalogTool.description,
      inputSchema: catalogTool.inputSchema
    });
    
    // Test different parameter transformation scenarios
    const testCases = [
      {
        name: 'Direct command format',
        userMessage: 'Create a catalog item called Test Item',
        originalParams: {
          command: 'Create a catalog item called \'Test Item\' in General'
        }
      },
      {
        name: 'Name-based parameters',
        userMessage: 'Create a catalog item called Employee Onboarding Request',
        originalParams: {
          name: 'Employee Onboarding Request',
          category: 'HR'
        }
      },
      {
        name: 'Natural language extraction',
        userMessage: 'I need to create a catalog item for laptop request in IT category',
        originalParams: {}
      },
      {
        name: 'Complex catalog item',
        userMessage: 'Create a catalog item called Software License Request in IT',
        originalParams: {
          title: 'Software License Request',
          description: 'Request for software licenses'
        }
      }
    ];
    
    for (const testCase of testCases) {
      logger.info(`\\n--- Testing: ${testCase.name} ---`);
      logger.info('User message:', testCase.userMessage);
      logger.info('Original parameters:', testCase.originalParams);
      
      // Transform parameters
      const transformedParams = MCPParameterTransformer.transformParameters(
        catalogTool.name,
        testCase.originalParams,
        testCase.userMessage
      );
      
      logger.info('Transformed parameters:', transformedParams);
      
      try {
        // Test the actual MCP call
        logger.info('Testing MCP call...');
        const result = await mcpClient.executeTool({
          name: catalogTool.name,
          arguments: transformedParams
        });
        
        logger.info('MCP call successful:', result);
      } catch (error) {
        logger.error('MCP call failed:', error);
      }
      
      logger.info('---');
    }
    
    // Test parameter extraction
    logger.info('\\n=== Testing Parameter Extraction ===');
    const extractionTests = [
      'Create a catalog item called \'Test Item\'',
      'I want to create Employee Onboarding Request catalog item',
      'Create a catalog item for laptop request',
      'Make a catalog item named Software License in IT'
    ];
    
    for (const message of extractionTests) {
      const extracted = MCPParameterTransformer.extractCatalogItemName(message);
      logger.info(`Message: "${message}" => Extracted: "${extracted}"`);
    }
    
    await mcpClient.disconnect();
    
  } catch (error) {
    logger.error('Error during parameter testing:', error);
  }
  
  process.exit(0);
}

// Run the test
testMCPParameters();