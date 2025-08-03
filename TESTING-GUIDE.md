# ServiceNow MCP WebApp Testing Guide

This guide provides comprehensive testing procedures to validate that the webapp delivers a Claude Desktop-like experience with ServiceNow superpowers.

## Prerequisites

1. ServiceNow MCP server running at the configured path
2. Valid ServiceNow instance credentials
3. Anthropic API key configured
4. All dependencies installed (`npm install` in both client and server directories)

## Testing Checklist

### 1. MCP Protocol Implementation ✓

**Test: MCP Initialization and Tool Discovery**
```bash
# Start the server and check logs for:
npm run dev

# Expected log messages:
# - "Starting MCP protocol initialization"
# - "Discovered X MCP tools: [tool names]"
# - "MCP client initialized successfully"
```

**Validation:**
- [ ] MCP server connects successfully
- [ ] All available tools are discovered
- [ ] Tool capabilities are properly parsed
- [ ] Connection remains stable

### 2. Tool Approval Flow ✓

**Test: Tool Permission Dialog**

1. Start a conversation: "Create a new incident for printer issues"
2. Verify tool approval dialog appears with:
   - [ ] Tool name displayed clearly
   - [ ] Parameters shown with values
   - [ ] Risk level indicated
   - [ ] "Allow for this chat" and "Deny" buttons

**Test: Approval Workflow**
- [ ] Clicking "Allow" executes the tool
- [ ] Clicking "Deny" cancels execution and shows denial message
- [ ] "Always Allow" option works for non-destructive tools
- [ ] Approval timeout works (30 seconds)

### 3. Natural Tool Selection ✓

**Test: Intent Recognition**

Try these natural language prompts:
- [ ] "I need to create an incident" → Triggers `create-incident` tool
- [ ] "Make a catalog item for office supplies" → Triggers `create-catalog-item` tool
- [ ] "Show me all incidents assigned to me" → Triggers `query-records` tool
- [ ] "Update change CHG0001234" → Triggers appropriate update tool

**Validation:**
- [ ] LLM correctly identifies when to use tools
- [ ] Tools are invoked with sensible parameters
- [ ] No tools triggered for conversational responses

### 4. Conversation Context Management ✓

**Test: Context Retention**

1. Create a catalog item: "Create a laptop request catalog item"
2. Follow up: "Add variables for laptop model and RAM"
3. Continue: "Create a UI policy to hide RAM when model is MacBook"

**Validation:**
- [ ] Assistant remembers previously created items
- [ ] References like "the catalog item" work correctly
- [ ] Full conversation history maintained
- [ ] Tool execution results included in context

### 5. Tool Chaining Support ✓

**Test: Multiple Tool Execution**

Request: "Create a comprehensive laptop request catalog item with variables, UI policies, and client scripts"

**Validation:**
- [ ] Multiple tools triggered in sequence
- [ ] Each tool waits for approval
- [ ] Tool execution order is logical
- [ ] Chain visualization shows progress
- [ ] All tools complete successfully

### 6. Streaming and Visualization ✓

**Test: Real-time Updates**

1. Send a message requiring tool use
2. Observe the UI during execution

**Validation:**
- [ ] Streaming text appears character by character
- [ ] Tool invocation cards appear when tools start
- [ ] Status changes (pending → executing → completed)
- [ ] Execution time displayed
- [ ] Results formatted properly

### 7. Error Handling and Recovery ✓

**Test: Error Scenarios**

**Tool Failure:**
1. Temporarily break MCP connection
2. Try to execute a tool

**Validation:**
- [ ] Error message displayed clearly
- [ ] Retry button appears for retryable errors
- [ ] Circuit breaker prevents repeated failures
- [ ] Recovery works when connection restored

**Approval Timeout:**
1. Trigger tool approval dialog
2. Wait 30+ seconds without responding

**Validation:**
- [ ] Dialog times out and closes
- [ ] Tool marked as denied
- [ ] Conversation continues without tool

### 8. Quick Actions and Templates ✓

**Test: Sidebar Integration**

1. Click "Create Incident" in sidebar
2. Click "Office Supplies Request" template

**Validation:**
- [ ] Natural language message sent to chat
- [ ] LLM processes request appropriately
- [ ] Tools triggered as expected
- [ ] No direct tool invocation from sidebar

### 9. ServiceNow Integration

**Test: Actual ServiceNow Operations**

**Prerequisites:** Valid ServiceNow instance access

1. Create an incident: "Create an incident for email server down"
2. Query records: "Show me open incidents"
3. Create catalog item: "Make a software request catalog item"

**Validation:**
- [ ] Records actually created in ServiceNow
- [ ] Query results accurate and current
- [ ] Links to ServiceNow records work
- [ ] Data formatting consistent

### 10. Performance and Stability

**Test: Extended Usage**

1. Run 20+ conversations with tool usage
2. Create 10+ catalog items in sequence
3. Test with multiple browser tabs

**Validation:**
- [ ] No memory leaks in frontend
- [ ] Server remains stable
- [ ] MCP connection persists
- [ ] Response times reasonable (<5s for tool execution)

## Visual Experience Testing

### UI/UX Validation

**Tool Approval Dialog:**
- [ ] Matches Claude Desktop design language
- [ ] Clear visual hierarchy
- [ ] Appropriate animations
- [ ] Responsive on different screen sizes

**Tool Invocation Display:**
- [ ] Clean, expandable tool cards
- [ ] Proper status indicators
- [ ] Color coding for success/error states
- [ ] ServiceNow record links formatted properly

**Conversation Flow:**
- [ ] Messages appear smoothly
- [ ] Typing indicators appropriate
- [ ] Tool execution doesn't block input
- [ ] Scroll behavior natural

## Integration Testing Scenarios

### Scenario 1: Complete Catalog Item Workflow
```
User: "Set up a comprehensive laptop replacement request"
Expected: Tool chain creating catalog item → variables → UI policies → client scripts
```

### Scenario 2: Incident Management
```
User: "There's a network outage affecting the east coast office"
Expected: Create incident with appropriate priority and assignment
```

### Scenario 3: Complex Query
```
User: "Show me all high priority incidents created this week assigned to the network team"
Expected: Query with multiple filters and proper formatting
```

### Scenario 4: Knowledge Discovery
```
User: "How do I configure email notifications for catalog requests?"
Expected: Web search for documentation, then potentially ServiceNow configuration
```

## Troubleshooting Common Issues

### MCP Connection Issues
- Check `SERVICENOW_MCP_PATH` environment variable
- Verify MCP server is running and accessible
- Check network connectivity

### Tool Approval Not Appearing
- Verify WebSocket connection established
- Check browser console for JavaScript errors
- Confirm event handlers registered properly

### Tool Execution Failures
- Check ServiceNow instance connectivity
- Verify credentials and permissions
- Review server logs for detailed error messages

## Success Criteria

The webapp achieves Claude Desktop-like experience when:

1. **Natural Interaction:** Users can describe what they want in plain English
2. **Seamless Tool Use:** Tools execute transparently with clear permission requests
3. **Contextual Awareness:** Assistant remembers previous actions and references
4. **Visual Polish:** UI feels modern, responsive, and professional
5. **Reliable Performance:** Stable under normal usage patterns
6. **Error Resilience:** Graceful handling of failures with recovery options

## Reporting Issues

When reporting issues, include:
- Exact steps to reproduce
- Expected vs actual behavior
- Browser console logs
- Server logs from the issue timeframe
- Screenshots/videos if relevant

The goal is an experience where users feel like they're talking to Claude who happens to have ServiceNow superpowers, not operating a ServiceNow tool with an AI interface.