const { spawn } = require('child_process');
const path = require('path');

console.log('=== Testing MCP Communication ===\n');

// Use the environment variable to get MCP path
const mcpPath = process.env.SERVICENOW_MCP_PATH;
if (!mcpPath) {
  console.error('SERVICENOW_MCP_PATH environment variable not set');
  process.exit(1);
}

console.log('MCP Path:', mcpPath);

// Check if the path exists and is executable
const fs = require('fs');
if (!fs.existsSync(mcpPath)) {
  console.error('MCP server not found at:', mcpPath);
  process.exit(1);
}

// Spawn MCP server
console.log('\n1. Spawning MCP server...');
const mcpProcess = spawn('node', [mcpPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
});

console.log('MCP process PID:', mcpProcess.pid);

// Set up logging for all streams
mcpProcess.stdout.on('data', (data) => {
  console.log('MCP stdout:', data.toString());
});

mcpProcess.stderr.on('data', (data) => {
  console.log('MCP stderr:', data.toString());
});

mcpProcess.on('error', (error) => {
  console.error('MCP process error:', error);
});

mcpProcess.on('exit', (code, signal) => {
  console.log(`MCP process exited with code ${code}, signal ${signal}`);
});

// Wait a bit for server to start, then send messages
setTimeout(() => {
  console.log('\n2. Sending initialize message...');
  
  // Send initialize message (required first message in MCP protocol)
  const initializeMessage = {
    jsonrpc: "2.0",
    id: "init-1", 
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  };
  
  const messageStr = JSON.stringify(initializeMessage) + '\n';
  console.log('Sending initialize:', messageStr);
  
  const writeResult = mcpProcess.stdin.write(messageStr);
  console.log('Write result:', writeResult);
  
  // Wait for response, then send notifications/initialized
  setTimeout(() => {
    console.log('\n3. Sending notifications/initialized...');
    
    const notificationMessage = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };
    
    const notificationStr = JSON.stringify(notificationMessage) + '\n';
    console.log('Sending notification:', notificationStr);
    mcpProcess.stdin.write(notificationStr);
    
    // Wait a bit more, then send test tool call
    setTimeout(() => {
      console.log('\n4. Sending test-connection tool call...');
      
      const toolCallMessage = {
        jsonrpc: "2.0",
        id: "tool-1",
        method: "tools/call",
        params: {
          name: "test-connection",
          arguments: {}
        }
      };
      
      const toolStr = JSON.stringify(toolCallMessage) + '\n';
      console.log('Sending tool call:', toolStr);
      mcpProcess.stdin.write(toolStr);
      
      // Wait for response then cleanup
      setTimeout(() => {
        console.log('\n5. Cleaning up...');
        mcpProcess.kill('SIGTERM');
        
        setTimeout(() => {
          console.log('\n=== Test Complete ===');
          process.exit(0);
        }, 1000);
      }, 3000);
      
    }, 1000);
  }, 1000);
}, 1000);