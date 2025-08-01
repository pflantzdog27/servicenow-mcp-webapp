import express from 'express';
import { ContextAwareMessageHandler } from '../handlers/context-aware-handler';
import { MCPClientManager } from '../mcp/mcp-client';
import { AnthropicService } from '../llm/anthropic-service';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

// Initialize services
let mcpClientManager: MCPClientManager;
let contextAwareHandler: ContextAwareMessageHandler;

const initializeServices = async () => {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
    await mcpClientManager.initialize();
    contextAwareHandler = new ContextAwareMessageHandler(mcpClientManager);
  }
  return { mcpClientManager, contextAwareHandler };
};

// Test endpoint to simulate a chat message without WebSocket
router.post('/simulate', async (req, res) => {
  try {
    const { message, model = 'claude-sonnet-4-20250514' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('🧪 Simulating chat message:', { message, model });
    
    await initializeServices();
    
    // Create mock user and socket
    const mockUser = {
      userId: 'test-user-id',
      email: 'test@example.com'
    };

    // Create a mock socket that collects events
    const events: Array<{ type: string; data: any; timestamp: Date }> = [];
    const mockSocket = {
      user: mockUser,
      emit: (eventType: string, data: any) => {
        events.push({ type: eventType, data, timestamp: new Date() });
        logger.info(`📡 Socket event: ${eventType}`, data);
      }
    } as any;

    // Create LLM service
    const llmService = new AnthropicService(model);
    
    // Generate a unique message ID
    const messageId = `test-${Date.now()}`;
    
    const startTime = Date.now();
    
    try {
      // Process the message using the context-aware handler
      await contextAwareHandler.processMessage(
        mockSocket,
        messageId,
        message,
        llmService,
        model
      );
      
      const processingTime = Date.now() - startTime;
      
      // Analyze the results
      const toolEvents = events.filter(e => e.type.includes('tool'));
      const streamEvents = events.filter(e => e.type.includes('stream'));
      const errorEvents = events.filter(e => e.type.includes('error'));
      
      const result = {
        success: errorEvents.length === 0,
        processingTime,
        events: events.length,
        toolExecutions: toolEvents.length,
        streamChunks: streamEvents.length,
        errors: errorEvents.length,
        summary: {
          toolsExecuted: toolEvents.filter(e => e.type === 'chat:tool_start').map(e => e.data.toolName),
          toolsCompleted: toolEvents.filter(e => e.type === 'chat:tool_complete').length,
          toolsFailed: toolEvents.filter(e => e.type === 'chat:tool_error').length,
          hasStreamContent: streamEvents.some(e => e.type === 'chat:text_stream')
        },
        eventLog: events
      };
      
      logger.info('✅ Chat simulation completed:', result.summary);
      
      res.json(result);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('❌ Chat simulation failed:', error);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        events: events.length,
        eventLog: events
      });
    }
    
  } catch (error) {
    logger.error('❌ Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint for quick tool verification
router.post('/quick-test', async (req, res) => {
  try {
    await initializeServices();
    
    const tests = [
      {
        name: 'ServiceNow Connection',
        message: 'Test the connection to ServiceNow',
        expectedTools: ['test-connection']
      },
      {
        name: 'Catalog Item Creation',
        message: 'Create a catalog item called "Test Item" in ServiceNow',
        expectedTools: ['create-catalog-item']
      },
      {
        name: 'Conversational',
        message: 'Hello, how are you?',
        expectedTools: []
      }
    ];

    const results = [];
    
    for (const test of tests) {
      logger.info(`🧪 Running test: ${test.name}`);
      
      const events: Array<{ type: string; data: any }> = [];
      const mockSocket = {
        user: { userId: 'test-user', email: 'test@example.com' },
        emit: (eventType: string, data: any) => {
          events.push({ type: eventType, data });
        }
      } as any;

      const llmService = new AnthropicService('claude-sonnet-4-20250514');
      const messageId = `test-${Date.now()}-${Math.random()}`;
      
      const startTime = Date.now();
      
      try {
        await contextAwareHandler.processMessage(
          mockSocket,
          messageId,
          test.message,
          llmService,
          'claude-sonnet-4-20250514'
        );
        
        const processingTime = Date.now() - startTime;
        const toolEvents = events.filter(e => e.type.includes('tool'));
        const executedTools = toolEvents
          .filter(e => e.type === 'chat:tool_start')
          .map(e => e.data.toolName);
        
        const passed = test.expectedTools.length === 0 
          ? executedTools.length === 0
          : test.expectedTools.every(tool => executedTools.includes(tool));
        
        results.push({
          name: test.name,
          passed,
          processingTime,
          expectedTools: test.expectedTools,
          executedTools,
          events: events.length,
          toolExecutions: toolEvents.length
        });
        
      } catch (error) {
        results.push({
          name: test.name,
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime
        });
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    
    res.json({
      success: passedTests === totalTests,
      results: results,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      }
    });
    
  } catch (error) {
    logger.error('❌ Quick test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;