# MCP Tools Debugging Guide

We've added comprehensive server-side logging to track MCP tool execution. Here's how to debug MCP issues:

## 🛠️ Available Debugging Tools

### 1. **Enhanced Server Logs (Console Output)**
The server now outputs detailed console logs for every MCP tool execution:

```bash
cd /Users/adampflantzer/Desktop/My_Apps/servicenow-mcp-webapp/server
npm run dev
```

**Look for these log patterns in your terminal:**
- `🔧 [TOOL-CALL] Received from LLM:` - Shows what the LLM requested
- `🔄 [MCP-TRANSFORM] Before/After:` - Parameter transformation
- `📤 [MCP-EXECUTE] About to call MCP server:` - Pre-execution status
- `📥 [MCP-RESPONSE] Raw result:` - Actual MCP server response
- `❌ [MCP-ERROR]` - Any errors that occur
- `💥 [MCP-ERROR] Tool execution threw exception:` - Exceptions

### 2. **Debug Log File**
A dedicated debug log file is created at: `server/logs/mcp-debug-YYYY-MM-DD.log`

This file captures:
- Every tool call with full context
- Parameter transformations
- MCP execution details
- Full responses and errors
- Execution timing

### 3. **Direct MCP Test API**
Test MCP tools directly without going through the chat interface:

```bash
# Test the MCP connection and create-catalog-item tool
curl http://localhost:3001/api/test/mcp-direct-test

# Check MCP status and logs
curl http://localhost:3001/api/test/mcp-logs
```

## 🔍 Debugging Steps

### Step 1: Check Server Console
1. Make sure your server is running: `npm run dev`
2. Try creating a catalog item in the web interface
3. Watch the terminal where you ran `npm run dev`
4. Look for the detailed logs showing each step

### Step 2: Check Debug Log File
```bash
# View the latest debug log
tail -50 server/logs/mcp-debug-$(date +%Y-%m-%d).log

# Or view all logs
cat server/logs/mcp-debug-$(date +%Y-%m-%d).log
```

### Step 3: Use Direct API Test
```bash
# Test MCP directly (this bypasses the chat interface)
curl -s http://localhost:3001/api/test/mcp-direct-test | jq '.'
```

This will show you:
- Whether the MCP client can connect to the ServiceNow MCP server
- What tools are available
- Test catalog item creation with different parameter formats
- Full execution logs and results

### Step 4: Check MCP Server Process
Make sure your ServiceNow MCP server is running:

```bash
# Check if the MCP server process is running
ps aux | grep servicenow-mcp

# Check the MCP server executable path
ls -la /Users/adampflantzer/Desktop/My_Apps/servicenow-mcp-consultancy/dist/simple-index.js
```

## 🐛 Common Issues and Solutions

### Issue 1: "Could not extract catalog item name from"
**Check for:**
- Parameter transformation logs showing the exact command sent
- Whether the command includes "called" and quoted item name
- MCP server logs (if you can see them)

### Issue 2: MCP Client Not Ready
**Check for:**
- Pool stats showing 0 connections
- MCP server executable path exists
- ServiceNow credentials are correct

### Issue 3: Tool Not Found
**Check for:**
- Available tools list in the logs
- Tool name prefixing (servicenow-mcp: vs bare names)

## 📊 What to Look For

### Successful Execution Pattern:
```
🔧 [TOOL-CALL] Received from LLM: {...}
🔄 [MCP-TRANSFORM] Before: {...}
✅ [MCP-TRANSFORM] After: {...}
📤 [MCP-EXECUTE] About to call MCP server...
⏱️ [MCP-EXECUTE] Calling MCP server now...
📥 [MCP-RESPONSE] Raw result: {"content":[{"type":"text","text":"✅ Successfully created..."}]}
✅ [MCP-SUCCESS] Tool executed successfully
```

### Error Pattern:
```
🔧 [TOOL-CALL] Received from LLM: {...}
🔄 [MCP-TRANSFORM] Before: {...}
✅ [MCP-TRANSFORM] After: {...}
📤 [MCP-EXECUTE] About to call MCP server...
⏱️ [MCP-EXECUTE] Calling MCP server now...
📥 [MCP-RESPONSE] Raw result: {"content":[{"type":"text","text":"❌ Failed to create..."}],"isError":true}
❌ [MCP-ERROR] Tool execution failed: [...]
```

## 📝 Troubleshooting Checklist

1. **Server Terminal**: Check for detailed console logs during tool execution
2. **Debug Log File**: Review `server/logs/mcp-debug-*.log` for complete execution trace
3. **Direct API Test**: Run `curl http://localhost:3001/api/test/mcp-direct-test` for isolated testing
4. **MCP Server Status**: Verify the ServiceNow MCP server process is running
5. **Tool Name Matching**: Ensure tool names match between webapp and MCP server
6. **Parameter Format**: Verify parameters are transformed to the expected format

## 🚀 Next Steps

After running these debugging tools, you should be able to see:
- Exactly what parameters are being sent to the MCP server
- The raw response from the MCP server
- Any transformation or communication issues
- Whether the problem is in the webapp, the communication, or the MCP server itself

If you still see issues, share the output from:
1. The server console logs
2. The debug log file
3. The direct API test results

This will provide a complete picture of what's happening during MCP tool execution.