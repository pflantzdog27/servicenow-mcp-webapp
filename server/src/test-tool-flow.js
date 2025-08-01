#!/usr/bin/env node

/**
 * Test Tool Flow Verification Script
 * 
 * This script tests the complete flow:
 * 1. User message → LLM
 * 2. LLM returns tool calls
 * 3. MCP tools execute
 * 4. Results return to LLM
 * 5. Final response to user
 */

const io = require('socket.io-client');
require('dotenv').config();

class ToolFlowTester {
  constructor() {
    this.socket = null;
    this.testResults = [];
    this.currentTest = null;
  }

  async connect() {
    console.log('🔌 Connecting to WebSocket server...');
    
    this.socket = io('http://localhost:3001', {
      auth: {
        token: 'test-token' // Simple auth for testing
      }
    });

    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('✅ Connected to server');
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection failed:', error.message);
        reject(error);
      });

      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  setupEventListeners() {
    // Track all WebSocket events for debugging
    this.socket.on('chat:stream_start', (data) => {
      console.log('📡 Stream started:', data);
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'stream_start', data, timestamp: Date.now() });
      }
    });

    this.socket.on('chat:stream', (data) => {
      if (data.type === 'text') {
        process.stdout.write(data.content);
        if (this.currentTest) {
          this.currentTest.streamContent += data.content;
        }
      }
    });

    this.socket.on('chat:tool_start', (data) => {
      console.log('\n🔧 Tool execution started:', {
        messageId: data.messageId,
        toolName: data.toolName,
        arguments: data.arguments
      });
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'tool_start', data, timestamp: Date.now() });
        this.currentTest.toolsExecuted.push({
          name: data.toolName,
          arguments: data.arguments,
          status: 'executing'
        });
      }
    });

    this.socket.on('chat:tool_complete', (data) => {
      console.log('✅ Tool execution completed:', {
        toolName: data.toolName,
        executionTime: data.executionTime,
        success: data.status === 'completed'
      });
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'tool_complete', data, timestamp: Date.now() });
        const tool = this.currentTest.toolsExecuted.find(t => t.name === data.toolName);
        if (tool) {
          tool.status = data.status;
          tool.result = data.result;
          tool.executionTime = data.executionTime;
        }
      }
    });

    this.socket.on('chat:tool_error', (data) => {
      console.error('❌ Tool execution failed:', {
        toolName: data.toolName,
        error: data.error
      });
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'tool_error', data, timestamp: Date.now() });
        const tool = this.currentTest.toolsExecuted.find(t => t.name === data.toolName);
        if (tool) {
          tool.status = 'error';
          tool.error = data.error;
        }
      }
    });

    this.socket.on('chat:stream_complete', (data) => {
      console.log('\n🏁 Stream completed');
      console.log('Final message:', {
        id: data.message.id,
        role: data.message.role,
        contentLength: data.message.content?.length || 0,
        toolCallsCount: data.message.toolCalls?.length || 0,
        model: data.message.model
      });
      
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'stream_complete', data, timestamp: Date.now() });
        this.currentTest.finalMessage = data.message;
        this.currentTest.completed = true;
      }
    });

    this.socket.on('chat:error', (data) => {
      console.error('💥 Chat error:', data);
      if (this.currentTest) {
        this.currentTest.events.push({ type: 'error', data, timestamp: Date.now() });
        this.currentTest.error = data;
      }
    });
  }

  async runTest(testName, message, expectedToolNames = []) {
    console.log(`\n🧪 Running test: ${testName}`);
    console.log(`📝 Message: "${message}"`);
    console.log(`🔨 Expected tools: [${expectedToolNames.join(', ')}]`);
    console.log('=' + '='.repeat(80));

    this.currentTest = {
      name: testName,
      message,
      expectedToolNames,
      events: [],
      toolsExecuted: [],
      streamContent: '',
      startTime: Date.now(),
      completed: false,
      error: null,
      finalMessage: null
    };

    // Send the message
    this.socket.emit('chat:message', {
      message: message,
      model: 'claude-sonnet-4-20250514'
    });

    // Wait for completion or timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('⏰ Test timed out after 30 seconds');
        this.currentTest.timedOut = true;
        resolve(this.analyzeTestResults());
      }, 30000);

      const checkCompletion = () => {
        if (this.currentTest.completed || this.currentTest.error) {
          clearTimeout(timeout);
          resolve(this.analyzeTestResults());
        } else {
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });
  }

  analyzeTestResults() {
    const test = this.currentTest;
    const results = {
      testName: test.name,
      success: false,
      duration: Date.now() - test.startTime,
      issues: [],
      summary: {}
    };

    console.log('\n📊 Test Analysis:');
    console.log('-'.repeat(50));

    // Check if LLM responded
    if (!test.streamContent && !test.error) {
      results.issues.push('No LLM response received');
    } else {
      console.log('✅ LLM responded');
    }

    // Check tool execution
    if (test.expectedToolNames.length > 0) {
      const executedToolNames = test.toolsExecuted.map(t => t.name);
      const missingTools = test.expectedToolNames.filter(name => !executedToolNames.includes(name));
      
      if (missingTools.length > 0) {
        results.issues.push(`Missing expected tools: ${missingTools.join(', ')}`);
      } else {
        console.log('✅ Expected tools were executed');
      }

      const failedTools = test.toolsExecuted.filter(t => t.status === 'error');
      if (failedTools.length > 0) {
        results.issues.push(`Failed tools: ${failedTools.map(t => t.name).join(', ')}`);
      }
    }

    // Check WebSocket events
    const eventTypes = test.events.map(e => e.type);
    const expectedEvents = ['stream_start', 'stream_complete'];
    if (test.expectedToolNames.length > 0) {
      expectedEvents.push('tool_start', 'tool_complete');
    }

    const missingEvents = expectedEvents.filter(event => !eventTypes.includes(event));
    if (missingEvents.length > 0) {
      results.issues.push(`Missing WebSocket events: ${missingEvents.join(', ')}`);
    }

    // Summary
    results.summary = {
      llmResponded: !!test.streamContent,
      toolsExecuted: test.toolsExecuted.length,
      toolsSucceeded: test.toolsExecuted.filter(t => t.status === 'completed').length,
      toolsFailed: test.toolsExecuted.filter(t => t.status === 'error').length,
      eventsReceived: test.events.length,
      hasError: !!test.error,
      timedOut: !!test.timedOut
    };

    results.success = results.issues.length === 0 && !test.error && !test.timedOut;

    console.log('Summary:', results.summary);
    
    if (results.issues.length > 0) {
      console.log('❌ Issues found:');
      results.issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('✅ All checks passed!');
    }

    this.testResults.push(results);
    return results;
  }

  async runAllTests() {
    const tests = [
      {
        name: 'ServiceNow Catalog Item Creation',
        message: 'Create a catalog item called "Test Laptop Request" in ServiceNow',
        expectedTools: ['create-catalog-item']
      },
      {
        name: 'ServiceNow Connection Test',
        message: 'Test the connection to ServiceNow',
        expectedTools: ['test-connection']
      },
      {
        name: 'ServiceNow Query',
        message: 'Show me all incidents in ServiceNow',
        expectedTools: ['query-records']
      },
      {
        name: 'Conversational Message',
        message: 'Hello, how are you?',
        expectedTools: [] // Should not trigger tools
      }
    ];

    console.log('🚀 Starting Tool Flow Verification Tests');
    console.log(`Running ${tests.length} tests...\n`);

    for (const test of tests) {
      await this.runTest(test.name, test.message, test.expectedTools);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between tests
    }

    this.printFinalReport();
  }

  printFinalReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 FINAL TEST REPORT');
    console.log('='.repeat(80));

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.filter(r => !r.success).forEach(result => {
        console.log(`  - ${result.testName}: ${result.issues.join(', ')}`);
      });
    }

    console.log('\n🔍 Detailed Results:');
    this.testResults.forEach(result => {
      console.log(`\n${result.testName}:`);
      console.log(`  Success: ${result.success ? '✅' : '❌'}`);
      console.log(`  Duration: ${result.duration}ms`);
      console.log(`  Tools Executed: ${result.summary.toolsExecuted}`);
      console.log(`  Tools Succeeded: ${result.summary.toolsSucceeded}`);
      console.log(`  Events Received: ${result.summary.eventsReceived}`);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('👋 Disconnected from server');
    }
  }
}

// Run the tests
async function main() {
  const tester = new ToolFlowTester();
  
  try {
    await tester.connect();
    await tester.runAllTests();
  } catch (error) {
    console.error('💥 Test execution failed:', error);
  } finally {
    tester.disconnect();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = ToolFlowTester;