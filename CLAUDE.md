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
   npm run dev
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
   - `SERVICENOW_MCP_PATH`: Path to ServiceNow MCP server

## Development

### Running Tests
```bash
npm test
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
│   │   └── types/        # TypeScript definitions
├── server/               # Node.js backend
│   ├── src/
│   │   ├── llm/          # LLM service implementations
│   │   ├── mcp/          # MCP client integration
│   │   ├── websocket/    # Socket.io handlers
│   │   └── utils/        # Utility functions
└── CLAUDE.md            # This file
```

## Recent Improvements

### Version 1.0 (MVP)
- ✅ Core chat functionality with streaming
- ✅ ServiceNow MCP tool integration
- ✅ Multi-LLM support (OpenAI, Anthropic)
- ✅ Token limit handling for different models
- ✅ Enhanced AI proactiveness for workflows
- ✅ Improved UI/UX with better progress indicators

## Upcoming Features

### Authentication & Persistence
- User login system
- Chat history saving
- Session management
- Multiple chat conversations

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

## Contributing

This project uses AI-assisted development. When contributing:
1. Follow existing code patterns
2. Maintain TypeScript type safety
3. Test all ServiceNow operations
4. Update documentation

## License

[Your License Here]

## Acknowledgments

- Built with Claude AI assistance
- ServiceNow MCP by [ServiceNow Team]
- Inspired by modern AI chat interfaces