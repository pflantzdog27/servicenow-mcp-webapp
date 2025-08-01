import express from 'express';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { MCPParameterTransformer } from '../mcp/mcp-parameter-transformer';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

/**
 * Direct MCP test endpoint to debug tool execution
 * GET /api/test/mcp-direct-test
 */
router.get('/mcp-direct-test', async (req, res) => {
  console.log('\n🧪 [MCP-DIRECT-TEST] Starting direct MCP test...');
  
  const testResults: any[] = [];
  
  try {
    // Initialize MCP client
    const mcpClient = getEnhancedMCPClient();
    
    console.log('🔗 [MCP-CLIENT] Checking MCP client status...');
    console.log('   - Is Ready:', mcpClient.isReady());
    console.log('   - Pool Stats:', mcpClient.getPoolStats());
    
    if (!mcpClient.isReady()) {
      console.log('🔄 [MCP-CLIENT] Initializing MCP client...');
      await mcpClient.initialize();
    }
    
    // Get available tools
    const availableTools = mcpClient.getAvailableTools();
    console.log('🛠️ [MCP-TOOLS] Available tools:', availableTools.map(t => t.name));
    
    testResults.push({
      step: 'client_initialization',
      success: true,
      data: {
        isReady: mcpClient.isReady(),
        poolStats: mcpClient.getPoolStats(),
        availableToolCount: availableTools.length,
        availableTools: availableTools.map(t => t.name)
      }
    });
    
    // Find the create-catalog-item tool
    const catalogTool = availableTools.find(t => t.name === 'servicenow-mcp:create-catalog-item');
    
    if (!catalogTool) {
      throw new Error('create-catalog-item tool not found in available tools');
    }
    
    console.log('✅ [MCP-TOOL] Found catalog tool:', catalogTool.name);
    console.log('   - Description:', catalogTool.description);
    console.log('   - Input Schema:', JSON.stringify(catalogTool.inputSchema, null, 2));
    
    testResults.push({
      step: 'tool_discovery',
      success: true,
      data: {
        toolName: catalogTool.name,
        description: catalogTool.description,
        inputSchema: catalogTool.inputSchema
      }
    });
    
    // Test different parameter scenarios
    const testCases = [
      {
        name: 'Test 1: Direct command format',
        userMessage: 'Create a catalog item called Test Direct API',
        toolCall: {
          name: catalogTool.name,
          arguments: {
            command: "Create a catalog item called 'Test Direct API' in General"
          }
        }
      },
      {
        name: 'Test 2: Parameter transformation',
        userMessage: 'Create a catalog item called API Test Item in IT',
        toolCall: {
          name: catalogTool.name,
          arguments: {
            name: 'API Test Item',
            category: 'IT'
          }
        }
      },
      {
        name: 'Test 3: Natural language extraction',
        userMessage: 'Create a catalog item called Server Maintenance Request in Infrastructure',
        toolCall: {
          name: catalogTool.name,
          arguments: {}
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n🧪 [TEST-CASE] ${testCase.name}`);
      console.log('   - User Message:', testCase.userMessage);
      console.log('   - Original Arguments:', JSON.stringify(testCase.toolCall.arguments, null, 2));
      
      try {
        // Transform parameters
        console.log('🔄 [TRANSFORM] Transforming parameters...');
        const transformedArguments = MCPParameterTransformer.transformParameters(
          testCase.toolCall.name,
          testCase.toolCall.arguments,
          testCase.userMessage
        );
        
        console.log('✅ [TRANSFORM] Transformed arguments:', JSON.stringify(transformedArguments, null, 2));
        
        // Execute the tool
        console.log('📤 [EXECUTE] Calling MCP server...');
        const startTime = Date.now();
        
        const result = await mcpClient.executeTool({
          name: testCase.toolCall.name,
          arguments: transformedArguments
        });
        
        const executionTime = Date.now() - startTime;
        
        console.log('📥 [RESULT] MCP server response:', JSON.stringify(result, null, 2));
        console.log('⏱️ [TIMING] Execution time:', executionTime, 'ms');
        
        testResults.push({
          step: testCase.name,
          success: !result.isError,
          executionTime,
          data: {
            userMessage: testCase.userMessage,
            originalArguments: testCase.toolCall.arguments,
            transformedArguments,
            result: result,
            isError: result.isError
          }
        });
        
        if (result.isError) {
          console.error('❌ [ERROR] Tool execution failed:', result.content);
        } else {
          console.log('✅ [SUCCESS] Tool executed successfully');
        }
        
      } catch (error) {
        console.error('💥 [EXCEPTION] Test case failed:', error);
        
        testResults.push({
          step: testCase.name,
          success: false,
          error: {
            message: String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        });
      }
    }
    
    // Test connection to MCP server directly
    console.log('\n🔌 [CONNECTION-TEST] Testing basic MCP connection...');
    try {
      const connectionTest = await mcpClient.executeTool({
        name: 'servicenow-mcp:test-connection',
        arguments: {}
      });
      
      console.log('📡 [CONNECTION-TEST] Result:', JSON.stringify(connectionTest, null, 2));
      
      testResults.push({
        step: 'connection_test',
        success: !connectionTest.isError,
        data: connectionTest
      });
      
    } catch (connError) {
      console.error('🚫 [CONNECTION-ERROR] Connection test failed:', connError);
      
      testResults.push({
        step: 'connection_test',
        success: false,
        error: {
          message: String(connError),
          stack: connError instanceof Error ? connError.stack : undefined
        }
      });
    }
    
    console.log('\n🏁 [TEST-COMPLETE] Direct MCP test completed');
    console.log('📊 [SUMMARY] Results:', testResults.length, 'tests run');
    
    res.json({
      success: true,
      message: 'Direct MCP test completed',
      timestamp: new Date().toISOString(),
      testResults,
      summary: {
        totalTests: testResults.length,
        passed: testResults.filter(r => r.success).length,
        failed: testResults.filter(r => !r.success).length
      }
    });
    
  } catch (error) {
    console.error('💥 [FATAL-ERROR] Direct MCP test failed:', error);
    
    res.status(500).json({
      success: false,
      error: {
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      testResults,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Check MCP server logs endpoint
 * GET /api/test/mcp-logs
 */
router.get('/mcp-logs', async (req, res) => {
  console.log('\n📋 [MCP-LOGS] Checking recent MCP activity...');
  
  try {
    const mcpClient = getEnhancedMCPClient();
    
    const logInfo = {
      timestamp: new Date().toISOString(),
      mcpClient: {
        isReady: mcpClient.isReady(),
        poolStats: mcpClient.getPoolStats()
      },
      availableTools: mcpClient.getAvailableTools().map(t => ({
        name: t.name,
        description: t.description
      })),
      serverProcess: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cwd: process.cwd()
      }
    };
    
    console.log('📊 [MCP-STATUS] Current status:', JSON.stringify(logInfo, null, 2));
    
    res.json({
      success: true,
      message: 'MCP status retrieved',
      data: logInfo
    });
    
  } catch (error) {
    console.error('❌ [MCP-LOGS-ERROR] Failed to get MCP logs:', error);
    
    res.status(500).json({
      success: false,
      error: {
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
});

export default router;