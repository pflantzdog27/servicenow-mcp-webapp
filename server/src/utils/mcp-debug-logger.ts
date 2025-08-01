import fs from 'fs';
import path from 'path';

/**
 * Debug logger specifically for MCP tool execution tracking
 * Writes to a dedicated debug log file for easier troubleshooting
 */
export class MCPDebugLogger {
  private static instance: MCPDebugLogger;
  private logFilePath: string;
  
  private constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create debug log file with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFilePath = path.join(logsDir, `mcp-debug-${timestamp}.log`);
    
    // Initialize log file
    this.writeToFile('='.repeat(80));
    this.writeToFile(`MCP Debug Log Started: ${new Date().toISOString()}`);
    this.writeToFile('='.repeat(80));
  }
  
  static getInstance(): MCPDebugLogger {
    if (!MCPDebugLogger.instance) {
      MCPDebugLogger.instance = new MCPDebugLogger();
    }
    return MCPDebugLogger.instance;
  }
  
  private writeToFile(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} | ${message}\n`;
    
    try {
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      console.error('Failed to write to MCP debug log:', error);
    }
  }
  
  logToolCall(data: {
    messageId: string;
    toolName: string;
    userMessage: string;
    originalArguments: any;
  }): void {
    this.writeToFile('\n' + '='.repeat(50));
    this.writeToFile(`🔧 TOOL CALL RECEIVED`);
    this.writeToFile(`Message ID: ${data.messageId}`);
    this.writeToFile(`Tool Name: ${data.toolName}`);
    this.writeToFile(`User Message: ${data.userMessage}`);
    this.writeToFile(`Original Arguments: ${JSON.stringify(data.originalArguments, null, 2)}`);
  }
  
  logParameterTransformation(data: {
    toolName: string;
    originalArgs: any;
    transformedArgs: any;
    userMessage?: string;
  }): void {
    this.writeToFile('\n🔄 PARAMETER TRANSFORMATION');
    this.writeToFile(`Tool: ${data.toolName}`);
    this.writeToFile(`Original: ${JSON.stringify(data.originalArgs, null, 2)}`);
    this.writeToFile(`Transformed: ${JSON.stringify(data.transformedArgs, null, 2)}`);
    if (data.userMessage) {
      this.writeToFile(`Context: ${data.userMessage}`);
    }
  }
  
  logMCPExecution(data: {
    toolName: string;
    arguments: any;
    mcpClientReady: boolean;
    poolStats: any;
  }): void {
    this.writeToFile('\n📤 MCP EXECUTION START');
    this.writeToFile(`Tool: ${data.toolName}`);
    this.writeToFile(`Arguments: ${JSON.stringify(data.arguments, null, 2)}`);
    this.writeToFile(`MCP Client Ready: ${data.mcpClientReady}`);
    this.writeToFile(`Pool Stats: ${JSON.stringify(data.poolStats, null, 2)}`);
  }
  
  logMCPResponse(data: {
    toolName: string;
    result: any;
    executionTime: number;
    isError: boolean;
  }): void {
    this.writeToFile('\n📥 MCP RESPONSE');
    this.writeToFile(`Tool: ${data.toolName}`);
    this.writeToFile(`Execution Time: ${data.executionTime}ms`);
    this.writeToFile(`Is Error: ${data.isError}`);
    this.writeToFile(`Result: ${JSON.stringify(data.result, null, 2)}`);
    
    if (data.isError) {
      this.writeToFile('❌ ERROR DETAILS:');
      if (data.result && data.result.content) {
        this.writeToFile(JSON.stringify(data.result.content, null, 2));
      }
    }
  }
  
  logError(data: {
    toolName: string;
    error: any;
    errorMessage: string;
    errorStack?: string;
    messageId: string;
  }): void {
    this.writeToFile('\n💥 EXCEPTION THROWN');
    this.writeToFile(`Tool: ${data.toolName}`);
    this.writeToFile(`Message ID: ${data.messageId}`);
    this.writeToFile(`Error Message: ${data.errorMessage}`);
    if (data.errorStack) {
      this.writeToFile(`Stack Trace: ${data.errorStack}`);
    }
    this.writeToFile(`Error Object: ${JSON.stringify(data.error, null, 2)}`);
  }
  
  logConnectionTest(data: {
    testName: string;
    success: boolean;
    result?: any;
    error?: any;
  }): void {
    this.writeToFile('\n🔌 CONNECTION TEST');
    this.writeToFile(`Test: ${data.testName}`);
    this.writeToFile(`Success: ${data.success}`);
    if (data.result) {
      this.writeToFile(`Result: ${JSON.stringify(data.result, null, 2)}`);
    }
    if (data.error) {
      this.writeToFile(`Error: ${JSON.stringify(data.error, null, 2)}`);
    }
  }
  
  logSummary(data: {
    sessionId?: string;
    toolsExecuted: number;
    successCount: number;
    errorCount: number;
    totalExecutionTime: number;
  }): void {
    this.writeToFile('\n📊 SESSION SUMMARY');
    this.writeToFile(`Session ID: ${data.sessionId || 'N/A'}`);
    this.writeToFile(`Tools Executed: ${data.toolsExecuted}`);
    this.writeToFile(`Successful: ${data.successCount}`);
    this.writeToFile(`Errors: ${data.errorCount}`);
    this.writeToFile(`Total Execution Time: ${data.totalExecutionTime}ms`);
    this.writeToFile('='.repeat(50));
  }
  
  getLogFilePath(): string {
    return this.logFilePath;
  }
  
  getRecentLogs(lines: number = 50): string[] {
    try {
      const content = fs.readFileSync(this.logFilePath, 'utf-8');
      const allLines = content.split('\n');
      return allLines.slice(-lines).filter(line => line.trim().length > 0);
    } catch (error) {
      console.error('Failed to read MCP debug log:', error);
      return [];
    }
  }
}

// Export singleton instance
export const mcpDebugLogger = MCPDebugLogger.getInstance();