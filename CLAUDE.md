# ServiceNow MCP Web Application

A sophisticated web application that bridges natural language AI assistants with ServiceNow operations through the Model Context Protocol (MCP).

## Project Overview

This application provides a ChatGPT/Claude-like interface for managing ServiceNow instances using natural language. It features multi-LLM support (OpenAI and Anthropic), real-time streaming responses, and seamless ServiceNow tool execution.

## Architecture

### Backend (Node.js/Express)
- **MCP Integration**: Connects to ServiceNow MCP server for tool execution
- **LLM Abstraction**: Unified interface for OpenAI and Anthropic models
- **WebSocket Support**: Real-time bidirectional communication using Socket.io
- **TypeScript**: Full type safety across the backend

### Frontend (React/TypeScript)
- **Three-Panel Layout**: Quick Actions, Chat Interface, Activity History
- **Real-time Updates**: WebSocket-based streaming responses
- **Dark Theme**: Professional ServiceNow-inspired UI
- **Tool Visualization**: Clear display of ServiceNow operations

## Key Features

1. **Multi-LLM Support**
   - OpenAI: GPT-4, GPT-3.5, O4-Mini
   - Anthropic: Claude 4 Sonnet
   - Easy model switching in UI

2. **ServiceNow Operations**
   - 25+ integrated MCP tools
   - Create incidents, catalog items, workflows
   - Query and update records
   - Manage users and groups

3. **Intelligent Workflows**
   - Proactive multi-step task completion
   - Context-aware suggestions
   - Real-time progress updates

4. **User Experience**
   - Streaming responses word-by-word
   - Tool execution visualization
   - Error handling and recovery

## Setup Instructions

1. **Clone Repository**
   ```bash
   git clone https://github.com/pflantzdog27/servicenow-mcp-webapp.git
   cd servicenow-mcp-webapp
   ```

2. **Backend Setup**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Configure your API keys and ServiceNow credentials
   
   # For enhanced version with real MCP integration:
   ./run-enhanced.sh
   
   # Or manually:
   npm run dev  # Enhanced version (default)
   npm run dev:basic  # Basic version without MCP pooling
   ```

3. **Frontend Setup**
   ```bash
   cd client
   npm install
   npm run dev
   ```

4. **Environment Variables**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `ANTHROPIC_API_KEY`: Your Anthropic API key
   - `SERVICENOW_INSTANCE_URL`: Your ServiceNow instance URL
   - `SERVICENOW_USERNAME`: ServiceNow username
   - `SERVICENOW_PASSWORD`: ServiceNow password
   - `SERVICENOW_MCP_PATH`: Path to ServiceNow MCP server executable
   - `DATABASE_URL`: PostgreSQL connection string
   - `REDIS_URL`: Redis connection string (optional)
   - `JWT_SECRET`: Secret for JWT token generation
   - `SESSION_SECRET`: Secret for session management

## Development

### Running Tests
```bash
npm test

# Test MCP connection
cd server
ts-node src/test-mcp-connection.ts
```

### Building for Production
```bash
npm run build
```

### Code Structure
```
servicenow-mcp-webapp/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── styles/       # Component styles
│   │   └── types/        # TypeScript definitions
├── server/               # Node.js backend
│   ├── src/
│   │   ├── llm/          # LLM service implementations
│   │   ├── mcp/          # MCP client integration
│   │   ├── middleware/   # Express middleware
│   │   ├── queues/       # Bull queue workers
│   │   ├── routes/       # REST API routes
│   │   ├── services/     # Business logic services
│   │   ├── types/        # TypeScript types
│   │   ├── websocket/    # Socket.io handlers
│   │   └── utils/        # Utility functions
│   └── prisma/           # Database schema and migrations
├── shared/               # Shared types between client/server
└── CLAUDE.md            # This file
```

## WebSocket Handler Architecture

The application uses a sophisticated multi-layer handler system for processing chat messages with enhanced debugging and monitoring capabilities.

### Handler Flow (Enhanced Mode)
```
Client WebSocket Message
        ↓
1. app-enhanced.ts (Entry Point)
   - Displays startup banner with TypeScript source confirmation
   - Initializes MCP connection pool
   - Sets up Socket.io with authentication
        ↓
2. setupEnhancedChatHandlers() (Routing Layer)
   - Creates MCPClientAdapter bridge
   - Instantiates EnhancedChatHandlerWithApproval
   - Routes 'chat:message' events
        ↓
3. EnhancedChatHandlerWithApproval (Business Logic)
   - Handles tool approval workflow
   - Manages conversation context
   - Processes LLM responses
   - Executes MCP tools with retry logic
        ↓
4. MCP Tool Execution (Integration Layer)
   - Parameter transformation
   - ServiceNow API calls via MCP server
   - Result formatting and error handling
```

### Key Architecture Components

#### 1. **Enhanced Chat Handler with Approval**
- **File**: `src/websocket/enhanced-chat-handler-with-approval.ts`
- **Purpose**: Main business logic for chat processing with tool approval workflow
- **Features**:
  - Tool approval dialog system
  - Conversation context management
  - Retry logic with circuit breaker
  - Strategic logging for monitoring

#### 2. **MCP Client Adapter**
- **Purpose**: Bridge between enhanced and legacy MCP clients
- **Features**:
  - Parameter transformation for ServiceNow tools
  - Connection pooling
  - Health monitoring

#### 3. **Handler Registration System**
- **File**: `src/websocket/enhanced-chat-handler.ts`
- **Purpose**: Routes WebSocket events to appropriate handlers
- **Features**:
  - Clean handler identification logging
  - Error handling with fallbacks
  - User context management

### Development Setup Enhancements

#### Build Safeguards
```json
{
  "scripts": {
    "predev": "npm run clean:dist",
    "dev": "npm run dev:enhanced", 
    "prebuild": "npm run clean:dist",
    "clean:dist": "rm -rf dist/",
    "clean": "npm run clean:dist && rm -rf node_modules/.cache"
  }
}
```

#### Startup Banner
When running in development mode, you'll see:
```
================================================================================
🚀 ServiceNow MCP Web Application (Enhanced Mode)
📝 Running from TypeScript source with ts-node-dev
⚡ Live reload enabled - changes will restart automatically
🔧 Debug logging: Enhanced handlers with strategic monitoring
🏗️  Architecture: Multiple handler system with approval workflow
================================================================================
```

#### Strategic Logging
- **Info Level**: Message processing, tool execution, user actions
- **Debug Level**: Session management, tool verification, LLM interactions
- **Error Level**: Handler failures, MCP errors, authentication issues

### Debugging Methodology

If you encounter issues similar to the "stale compiled JS" problem:

1. **Check the startup banner** - Ensures TypeScript source is running
2. **Verify handler logs** - Strategic logging shows execution flow
3. **Clear dist folder** - `npm run clean:dist` removes stale compiled files
4. **Monitor MCP connections** - Pool statistics in startup diagnostics

This architecture prevents debugging confusion by clearly indicating when TypeScript source is running versus compiled JavaScript, while maintaining clean, strategic logging for production monitoring.

## Recent Improvements

### Version 2.1 (Critical Bug Fixes - Latest)
- ✅ **Fixed ServiceNow Tool Parameter Issue**
  - **Problem**: Claude was calling ServiceNow tools with empty arguments `{}`, causing 400 errors
  - **Root Cause**: Missing or incomplete tool parameter schemas in MCP client
  - **Solution**: Enhanced tool schema definitions with comprehensive parameter specifications
  - **Enhanced System Prompt**: Added detailed guidance for proper ServiceNow tool usage
  - **Result**: Claude now properly extracts parameters from natural language and calls tools correctly

- ✅ **Tool Approval Workflow Perfected**
  - Complete tool discovery chain: MCP Server → MCP Client → Chat Handler → LLM Service → Claude API
  - Real-time tool approval dialog matching Claude Desktop experience
  - Fixed message lookup issues during tool approval process
  - Enhanced tool execution with proper parameter passing

- ✅ **Comprehensive Tool Schema Enhancement**
  - 27 ServiceNow tools with detailed parameter schemas
  - Specific examples and format requirements for each tool
  - Smart parameter extraction from natural language requests
  - Proper validation and error handling for tool calls

### Version 2.0 (Enhanced Architecture)
- ✅ **Enhanced MCP Integration**
  - Connection pooling for improved performance
  - Real ServiceNow tool execution with actual results
  - Comprehensive logging and debugging capabilities
  - Automatic reconnection and health checks
- ✅ **Advanced Chat Features**
  - Word-by-word streaming with thinking indicators
  - Enhanced tool visualization with progress tracking
  - Improved error handling and retry mechanisms
  - Better context management for long conversations
- ✅ **Developer Tools**
  - Built-in test suite for MCP connectivity
  - Debug status panel for real-time monitoring
  - Developer tools panel with system metrics
  - Test prompts panel for quick testing
- ✅ **Production-Ready Features**
  - Rate limiting and request throttling
  - Redis-based session management
  - Queue-based tool execution
  - Enhanced authentication with JWT
  - Database persistence with Prisma ORM
- ✅ **UI/UX Polish**
  - Auto-generated chat titles from conversation content
  - Detailed timestamp formatting (relative times, actual hours)
  - Human-readable model names in interface
  - Clean header dropdown without provider suffixes
  - SVG logo for crisp display
  - Streamlined chat history list without redundant information

### Version 1.0 (MVP)
- ✅ Core chat functionality with streaming
- ✅ ServiceNow MCP tool integration
- ✅ Multi-LLM support (OpenAI, Anthropic)
- ✅ Token limit handling for different models
- ✅ Enhanced AI proactiveness for workflows
- ✅ Improved UI/UX with better progress indicators

## Upcoming Features

### Authentication & Persistence
- ✅ User login system (implemented)
- ✅ Chat history saving (implemented)
- ✅ Session management (implemented)
- ✅ Multiple chat conversations (implemented)
- Advanced user roles and permissions
- SSO integration with ServiceNow

### Context Management
- Token/context limit tracking
- Automatic context window warnings
- Conversation summarization
- Smart context pruning

### Enhanced Features
- File upload support
- Export chat history
- Custom quick actions
- Workflow templates

## Model Token Limits

Currently configured limits:
- **GPT-4**: 8K context (2K completion)
- **GPT-3.5**: 4K context (1K completion)
- **O4-Mini**: 128K context (32K completion)
- **Claude Sonnet**: 200K tokens

## Debugging & Troubleshooting

### MCP Connection Issues
If tools show "completed" but with generic responses:

1. **Check MCP Path**: Ensure `SERVICENOW_MCP_PATH` points to the executable
2. **Verify Credentials**: Check ServiceNow credentials in `.env`
3. **Test Connection**: Run `ts-node src/test-mcp-connection.ts`
4. **Check Logs**: Look for `[MCP-POOL]`, `[MCP-CLIENT]`, and `[MCP]` prefixes

### Common Issues
- **"MCP server not found"**: Verify the path exists and is executable
- **Generic tool responses**: Ensure you're running the enhanced version (`npm run dev`)
- **WebSocket disconnections**: Check Redis connection if using session persistence

### Debug Tools
- **Debug Status Panel**: Shows real-time connection status
- **Developer Tools Panel**: Monitor system metrics and tool executions
- **Test Checklist Panel**: Run automated tests for all components
- **Enhanced Logging**: Comprehensive MCP client debugging with tool schema verification
- **Tool Parameter Validation**: Real-time validation of tool calls and parameter passing

## Contributing

This project uses AI-assisted development. When contributing:
1. Follow existing code patterns
2. Maintain TypeScript type safety
3. Test all ServiceNow operations
4. Update documentation
5. Add comprehensive logging for debugging

## License

[Your License Here]

## Acknowledgments

- Built with Claude AI assistance
- ServiceNow MCP by [ServiceNow Team]
- Inspired by modern AI chat interfaces