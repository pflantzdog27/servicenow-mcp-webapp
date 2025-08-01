import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, Play, RefreshCw } from 'lucide-react';

interface TestResult {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  duration?: number;
  details?: any;
}

interface TestChecklistPanelProps {
  socket: any;
  onClose: () => void;
}

const TestChecklistPanel: React.FC<TestChecklistPanelProps> = ({ socket, onClose }) => {
  const [tests, setTests] = useState<TestResult[]>([
    {
      id: 'mcp-connection',
      name: 'MCP Connection',
      description: 'Verify connection to ServiceNow MCP server',
      status: 'pending'
    },
    {
      id: 'tool-discovery',
      name: 'Tool Discovery',
      description: 'Verify available ServiceNow tools are loaded',
      status: 'pending'
    },
    {
      id: 'simple-tool-call',
      name: 'Simple Tool Call',
      description: 'Test basic ServiceNow tool invocation',
      status: 'pending'
    },
    {
      id: 'ui-tool-display',
      name: 'Tool UI Display',
      description: 'Verify Claude-style tool blocks render correctly',
      status: 'pending'
    },
    {
      id: 'syntax-highlighting',
      name: 'Syntax Highlighting',
      description: 'Check JSON syntax highlighting in tool blocks',
      status: 'pending'
    },
    {
      id: 'collapsible-blocks',
      name: 'Collapsible Blocks',
      description: 'Test expand/collapse functionality',
      status: 'pending'
    },
    {
      id: 'multiple-tools',
      name: 'Multiple Tool Calls',
      description: 'Test sequence of multiple tool calls',
      status: 'pending'
    },
    {
      id: 'error-handling',
      name: 'Error Handling',
      description: 'Test graceful error state handling',
      status: 'pending'
    },
    {
      id: 'streaming-response',
      name: 'Streaming Response',
      description: 'Verify real-time streaming works correctly',
      status: 'pending'
    },
    {
      id: 'websocket-connection',
      name: 'WebSocket Connection',
      description: 'Test WebSocket connection stability',
      status: 'pending'
    }
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);

  const updateTest = (id: string, updates: Partial<TestResult>) => {
    setTests(prev => prev.map(test => 
      test.id === id ? { ...test, ...updates } : test
    ));
  };

  const runTest = async (testId: string): Promise<void> => {
    const startTime = Date.now();
    updateTest(testId, { status: 'running' });
    setCurrentTest(testId);

    try {
      switch (testId) {
        case 'mcp-connection':
          await testMCPConnection();
          break;
        case 'tool-discovery':
          await testToolDiscovery();
          break;
        case 'simple-tool-call':
          await testSimpleToolCall();
          break;
        case 'ui-tool-display':
          await testUIToolDisplay();
          break;
        case 'syntax-highlighting':
          await testSyntaxHighlighting();
          break;
        case 'collapsible-blocks':
          await testCollapsibleBlocks();
          break;
        case 'multiple-tools':
          await testMultipleTools();
          break;
        case 'error-handling':
          await testErrorHandling();
          break;
        case 'streaming-response':
          await testStreamingResponse();
          break;
        case 'websocket-connection':
          await testWebSocketConnection();
          break;
        default:
          throw new Error(`Unknown test: ${testId}`);
      }

      const duration = Date.now() - startTime;
      updateTest(testId, { 
        status: 'passed', 
        duration,
        error: undefined 
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      updateTest(testId, { 
        status: 'failed', 
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    for (const test of tests) {
      await runTest(test.id);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setIsRunning(false);
    setCurrentTest(null);
  };

  // Test implementations
  const testMCPConnection = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MCP connection test timed out'));
      }, 5000);

      socket.emit('test:mcp-connection');
      socket.once('test:mcp-connection-result', (result: any) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve();
        } else {
          reject(new Error(result.error || 'MCP connection failed'));
        }
      });
    });
  };

  const testToolDiscovery = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool discovery test timed out'));
      }, 5000);

      socket.emit('test:tool-discovery');
      socket.once('test:tool-discovery-result', (result: any) => {
        clearTimeout(timeout);
        if (result.success && result.tools && result.tools.length > 0) {
          updateTest('tool-discovery', { 
            details: { toolCount: result.tools.length, tools: result.tools }
          });
          resolve();
        } else {
          reject(new Error(result.error || 'No tools discovered'));
        }
      });
    });
  };

  const testSimpleToolCall = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Simple tool call test timed out'));
      }, 10000);

      const messageId = `test-${Date.now()}`;
      
      socket.emit('chat:message', {
        message: 'Please list the available ServiceNow tables (this is a test)',
        model: 'claude-sonnet-4-20250514',
        isTest: true
      });

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('chat:tool_complete');
        socket.off('chat:error');
      };

      socket.once('chat:tool_complete', (data: any) => {
        cleanup();
        if (data.result && !data.result.isError) {
          resolve();
        } else {
          reject(new Error('Tool call failed or returned error'));
        }
      });

      socket.once('chat:error', (error: any) => {
        cleanup();
        reject(new Error(error.message || 'Tool call failed'));
      });
    });
  };

  const testUIToolDisplay = async () => {
    // This test checks if tool invocation UI components are rendered
    const toolBlocks = document.querySelectorAll('[data-testid="tool-invocation"]');
    if (toolBlocks.length === 0) {
      throw new Error('No tool invocation UI blocks found');
    }
    
    const hasCollapsibleSections = document.querySelectorAll('[data-testid="collapsible-section"]').length > 0;
    if (!hasCollapsibleSections) {
      throw new Error('Collapsible sections not found in tool blocks');
    }
  };

  const testSyntaxHighlighting = async () => {
    const codeBlocks = document.querySelectorAll('pre code[class*="language-"]');
    if (codeBlocks.length === 0) {
      throw new Error('No syntax-highlighted code blocks found');
    }
    
    // Check if Prism.js classes are applied
    const hasPrismClasses = Array.from(codeBlocks).some(block => 
      block.querySelector('.token')
    );
    
    if (!hasPrismClasses) {
      throw new Error('Syntax highlighting tokens not found');
    }
  };

  const testCollapsibleBlocks = async () => {
    const collapsibleButtons = document.querySelectorAll('[data-testid="collapse-toggle"]');
    if (collapsibleButtons.length === 0) {
      throw new Error('No collapsible toggle buttons found');
    }
    
    // Test clicking a toggle button
    const firstButton = collapsibleButtons[0] as HTMLButtonElement;
    const initialState = firstButton.getAttribute('aria-expanded');
    firstButton.click();
    
    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const newState = firstButton.getAttribute('aria-expanded');
    if (initialState === newState) {
      throw new Error('Collapsible state did not change on click');
    }
  };

  const testMultipleTools = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Multiple tools test timed out'));
      }, 15000);

      let toolCallsReceived = 0;
      const expectedCalls = 2; // Expect at least 2 tool calls

      socket.emit('chat:message', {
        message: 'Create a test incident and then query for recent incidents (this is a test)',
        model: 'claude-sonnet-4-20250514',
        isTest: true
      });

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('chat:tool_complete');
        socket.off('chat:stream_complete');
        socket.off('chat:error');
      };

      socket.on('chat:tool_complete', () => {
        toolCallsReceived++;
      });

      socket.once('chat:stream_complete', () => {
        cleanup();
        if (toolCallsReceived >= expectedCalls) {
          resolve();
        } else {
          reject(new Error(`Expected ${expectedCalls} tool calls, got ${toolCallsReceived}`));
        }
      });

      socket.once('chat:error', (error: any) => {
        cleanup();
        reject(new Error(error.message || 'Multiple tools test failed'));
      });
    });
  };

  const testErrorHandling = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Error handling test timed out'));
      }, 10000);

      socket.emit('chat:message', {
        message: 'Please call an invalid ServiceNow tool or use invalid parameters (this is a test)',
        model: 'claude-sonnet-4-20250514',
        isTest: true
      });

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('chat:tool_error');
        socket.off('chat:tool_complete');
      };

      socket.once('chat:tool_error', (data: any) => {
        cleanup();
        // Check if error is displayed properly in UI
        setTimeout(() => {
          const errorElements = document.querySelectorAll('[data-testid="tool-error"]');
          if (errorElements.length > 0) {
            resolve();
          } else {
            reject(new Error('Error state not displayed in UI'));
          }
        }, 500);
      });

      socket.once('chat:tool_complete', (data: any) => {
        cleanup();
        if (data.result && data.result.isError) {
          resolve(); // Error was handled gracefully
        } else {
          reject(new Error('Expected tool error but got success'));
        }
      });
    });
  };

  const testStreamingResponse = async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Streaming response test timed out'));
      }, 10000);

      let streamChunksReceived = 0;

      socket.emit('chat:message', {
        message: 'Please provide a detailed explanation of ServiceNow (this is a test)',
        model: 'claude-sonnet-4-20250514',
        isTest: true
      });

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('chat:stream');
        socket.off('chat:stream_complete');
      };

      socket.on('chat:stream', () => {
        streamChunksReceived++;
      });

      socket.once('chat:stream_complete', () => {
        cleanup();
        if (streamChunksReceived > 5) { // Expect multiple stream chunks
          resolve();
        } else {
          reject(new Error(`Expected multiple stream chunks, got ${streamChunksReceived}`));
        }
      });
    });
  };

  const testWebSocketConnection = async () => {
    if (!socket.connected) {
      throw new Error('WebSocket is not connected');
    }

    // Test ping/pong
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket ping test timed out'));
      }, 5000);

      const startTime = Date.now();
      socket.emit('ping');
      
      socket.once('pong', () => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;
        updateTest('websocket-connection', { 
          details: { latency }
        });
        resolve();
      });
    });
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return 'border-green-500 bg-green-50';
      case 'failed':
        return 'border-red-500 bg-red-50';
      case 'running':
        return 'border-blue-500 bg-blue-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const passedTests = tests.filter(t => t.status === 'passed').length;
  const failedTests = tests.filter(t => t.status === 'failed').length;
  const totalTests = tests.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ServiceNow MCP Test Suite</h2>
            <p className="text-sm text-gray-600 mt-1">
              Comprehensive testing of MCP integration and UI components
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              {passedTests}/{totalTests} passed
              {failedTests > 0 && `, ${failedTests} failed`}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex space-x-2">
              <button
                onClick={runAllTests}
                disabled={isRunning}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>{isRunning ? 'Running Tests...' : 'Run All Tests'}</span>
              </button>
              <button
                onClick={() => {
                  setTests(prev => prev.map(t => ({ ...t, status: 'pending' as const, error: undefined })));
                }}
                disabled={isRunning}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
            
            {isRunning && (
              <div className="text-sm text-gray-600 flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running: {currentTest}</span>
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {tests.map((test) => (
              <div
                key={test.id}
                className={`border rounded-lg p-4 ${getStatusColor(test.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(test.status)}
                    <div>
                      <h3 className="font-medium text-gray-900">{test.name}</h3>
                      <p className="text-sm text-gray-600">{test.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {test.duration && (
                      <span className="text-xs text-gray-500">{test.duration}ms</span>
                    )}
                    <button
                      onClick={() => runTest(test.id)}
                      disabled={isRunning}
                      className="bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Run
                    </button>
                  </div>
                </div>
                
                {test.error && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span>{test.error}</span>
                    </div>
                  </div>
                )}
                
                {test.details && (
                  <div className="mt-2 p-2 bg-gray-100 border border-gray-200 rounded text-sm text-gray-700">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(test.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestChecklistPanel;