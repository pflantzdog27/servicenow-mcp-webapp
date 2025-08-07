import { AnthropicService } from './llm/anthropic-service';
import { MCPClientAdapter } from './mcp/enhanced-mcp-client';
import logger from './utils/logger';

async function testClaudeToolCalling() {
  console.log("🧪 Testing Claude Tool Calling Behavior");

  try {
    // Initialize MCP client to get tools
    const mcpClient = new MCPClientAdapter();
    await mcpClient.connect();
    
    const tools = await mcpClient.listTools();
    console.log(`📋 Available tools: ${tools.length}`);
    
    // Initialize Anthropic service with tools
    const anthropicService = new AnthropicService('claude-sonnet-4-20250514');
    anthropicService.setTools({ mcp: tools, web: [] });
    
    // Test 1: Simple request that should extract parameters
    console.log("\n🧪 TEST 1: Creating a variable request");
    const testMessage1 = "Create three random variables to show the different capabilities of creating variables as a proof of concept";
    
    console.log("📝 Sending message:", testMessage1);
    
    const response = await anthropicService.sendMessage([
      { role: 'user', content: testMessage1 }
    ]);
    
    console.log("🤖 Claude's response:");
    console.log("Message:", response.message);
    console.log("Tool calls count:", response.toolCalls?.length || 0);
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      response.toolCalls.forEach((toolCall, index) => {
        console.log(`\n🔧 Tool Call ${index + 1}:`);
        console.log("- Name:", toolCall.name);
        console.log("- Arguments:", JSON.stringify(toolCall.arguments, null, 2));
        console.log("- Arguments empty?", Object.keys(toolCall.arguments || {}).length === 0);
      });
    } else {
      console.log("❌ No tool calls made by Claude");
    }
    
    // Test 2: Explicit create-variable request with specific parameters
    console.log("\n🧪 TEST 2: Explicit variable creation request");
    const testMessage2 = "Create a variable named 'employee_name' with question text 'Employee Name' of type string for the catalog item we just created";
    
    console.log("📝 Sending message:", testMessage2);
    
    const response2 = await anthropicService.sendMessage([
      { role: 'user', content: testMessage1 },
      { role: 'assistant', content: response.message },
      { role: 'user', content: testMessage2 }
    ]);
    
    console.log("🤖 Claude's response:");
    console.log("Message:", response2.message);
    console.log("Tool calls count:", response2.toolCalls?.length || 0);
    
    if (response2.toolCalls && response2.toolCalls.length > 0) {
      response2.toolCalls.forEach((toolCall, index) => {
        console.log(`\n🔧 Tool Call ${index + 1}:`);
        console.log("- Name:", toolCall.name);
        console.log("- Arguments:", JSON.stringify(toolCall.arguments, null, 2));
        console.log("- Arguments empty?", Object.keys(toolCall.arguments || {}).length === 0);
      });
    } else {
      console.log("❌ No tool calls made by Claude");
    }

    await mcpClient.disconnect();
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
if (require.main === module) {
  testClaudeToolCalling().then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  }).catch(error => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  });
}