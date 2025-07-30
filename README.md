# ServiceNow MCP Web Application

A sophisticated web application that provides a natural language interface to ServiceNow through Model Context Protocol (MCP) integration, supporting multiple LLM models (OpenAI GPT and Anthropic Claude).

## Features

### 🎯 Core Functionality
- **Natural Language Interface**: Interact with ServiceNow using plain English
- **Multi-LLM Support**: Choose between OpenAI GPT and Anthropic Claude models
- **Real-time Streaming**: Live responses with tool execution visualization
- **MCP Integration**: Direct connection to ServiceNow MCP server

### 🖥️ User Interface
- **Three-Panel Layout**: Quick Actions, Chat Interface, Activity History
- **Dark Theme**: Modern dark UI with accent colors (#00d4ff primary, #00ff88 success)
- **Real-time Updates**: WebSocket-powered live updates
- **Tool Visualization**: See MCP tool executions as they happen

### 🔧 Quick Actions
- Create Incident
- Update Change Request
- New Catalog Item
- Manage Groups
- Generate Report

### 📊 Activity Tracking
- Complete audit trail of all operations
- Export functionality for compliance
- Real-time operation status
- ServiceNow record links

## Architecture

### Backend (Node.js/Express)
```
server/
├── src/
│   ├── app.ts                 # Main Express server with Socket.io
│   ├── mcp/
│   │   └── mcp-client.ts      # ServiceNow MCP connection manager
│   ├── llm/
│   │   ├── llm-interface.ts   # Abstract LLM interface
│   │   ├── openai-service.ts  # OpenAI implementation
│   │   └── anthropic-service.ts # Anthropic implementation
│   ├── websocket/
│   │   ├── chat-handler.ts    # Chat message processing
│   │   └── stream-handler.ts  # Streaming response management
│   └── utils/
│       └── logger.ts          # Winston logging
```

### Frontend (React/TypeScript)
```
client/
├── src/
│   ├── App.tsx               # Main application layout
│   ├── components/
│   │   ├── Header.tsx        # Logo + Model selector
│   │   ├── Sidebar.tsx       # Quick actions + Templates
│   │   ├── ChatInterface.tsx # Chat messages + Input
│   │   ├── ActivityPanel.tsx # History tracking
│   │   ├── Message.tsx       # Individual message component
│   │   └── ToolInvocation.tsx # MCP tool execution display
│   ├── hooks/
│   │   └── useWebSocket.ts   # WebSocket connection management
│   └── services/
```

## Prerequisites

1. **ServiceNow MCP Server**: You need a working ServiceNow MCP server
2. **API Keys**: OpenAI and/or Anthropic API keys
3. **Node.js**: Version 18 or higher
4. **ServiceNow Instance**: Active ServiceNow instance

## Installation

### 1. Clone and Setup
```bash
cd servicenow-mcp-webapp
```

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` with your configuration:
```env
SERVICENOW_MCP_PATH=/path/to/servicenow-mcp
SERVICENOW_INSTANCE_URL=https://your-instance.service-now.com
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
PORT=3001
NODE_ENV=development
```

### 3. Frontend Setup
```bash
cd client
npm install
cp .env.example .env
```

Edit `.env` with your configuration:
```env
VITE_SERVER_URL=http://localhost:3001
VITE_SERVICENOW_INSTANCE_URL=https://your-instance.service-now.com
```

## Running the Application

### Development Mode
```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

### Production Build
```bash
# Build backend
cd server
npm run build
npm start

# Build frontend
cd client
npm run build
npm run preview
```

## Usage

### Basic Chat Operations
1. Select your preferred LLM model from the header dropdown
2. Type natural language requests in the chat interface
3. Watch as the AI executes ServiceNow MCP tools in real-time
4. View results with clickable ServiceNow record links

### Quick Actions
- Click any Quick Action button to start a guided workflow
- Templates provide pre-configured ServiceNow operations
- All actions appear in the Activity History for audit trails

### Example Interactions

**Create an Incident:**
```
User: "Create an incident for printer issues in the IT department"
Assistant: [Executes servicenow-mcp:create-incident tool]
Result: ✅ Incident INC0012345 created successfully [View Record]
```

**Complex Workflow:**
```
User: "Create a laptop request form with manager approval workflow"
Assistant: [Executes multiple MCP tools sequentially]
- Creates catalog item
- Configures approval workflow
- Sets up form variables
Result: Complete workflow with links to all created records
```

## MCP Integration Details

### Tool Execution Flow
1. User sends natural language message
2. LLM parses request and identifies required ServiceNow operations
3. LLM generates MCP tool calls with parameters
4. Backend queues and executes tools through MCP client
5. Results streamed back to frontend with real-time updates

### Supported MCP Operations
- **Record Management**: Create, read, update, delete records
- **Catalog Management**: Create catalog items, configure workflows
- **User Management**: Manage users, groups, roles
- **Reporting**: Generate custom reports and analytics
- **Workflow Operations**: Configure approval workflows

### Error Handling
- Graceful MCP connection failures with retry logic
- LLM API timeout handling
- WebSocket reconnection for client resilience
- Comprehensive logging for debugging

## Security Considerations

- API keys stored in environment variables only
- No sensitive data logged or exposed
- ServiceNow authentication handled by MCP server
- WebSocket connections validated and rate-limited

## Troubleshooting

### Common Issues

**MCP Connection Failed:**
```bash
# Check ServiceNow MCP server path
echo $SERVICENOW_MCP_PATH
# Verify MCP server is executable
./path/to/servicenow-mcp --version
```

**API Key Issues:**
```bash
# Test OpenAI connection
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models

# Test Anthropic connection
curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
```

**WebSocket Connection Issues:**
- Check firewall settings for ports 3000/3001
- Verify CORS configuration in server
- Check browser console for connection errors

## Development

### Adding New LLM Providers
1. Extend `LLMService` abstract class in `llm/llm-interface.ts`
2. Implement provider-specific service (e.g., `llm/custom-service.ts`)
3. Add to model selection in `components/Header.tsx`
4. Update chat handler in `websocket/chat-handler.ts`

### Adding New Quick Actions
1. Update `quickActions` array in `components/Sidebar.tsx`
2. Add corresponding MCP tool mappings
3. Update activity tracking for new operations

### Extending Activity Tracking
1. Modify `ActivityPanel.tsx` for new display formats
2. Add export formats in activity service
3. Update audit trail requirements

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow TypeScript and React best practices
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting guide above
2. Review ServiceNow MCP server documentation
3. Submit GitHub issues with detailed error logs
4. Include environment details and reproduction steps