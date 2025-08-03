import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Loader2 } from 'lucide-react';
import Message from './Message';
import ThinkingIndicator from './ThinkingIndicator';
import ToolApprovalDialog from './ToolApprovalDialog';
import { useAuth } from '../contexts/AuthContext';
import chatService, { ChatSession as ChatSessionType } from '../services/chat';
import { ToolApprovalRequest, ToolApprovalResponse } from '../../../shared/src/types/mcp';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
}

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
  model?: string;
  isStreaming?: boolean;
}

interface EnhancedChatInterfaceProps {
  socket: Socket | null;
  selectedModel: string;
  chatId?: string;
}

const EnhancedChatInterface: React.FC<EnhancedChatInterfaceProps> = ({ 
  socket, 
  selectedModel, 
  chatId 
}) => {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSessionType | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [executingTools, setExecutingTools] = useState<Array<{
    id: string;
    name: string;
    status: 'pending' | 'executing' | 'completed' | 'error';
    displayName: string;
  }>>([]);
  const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
  const [approvedTools, setApprovedTools] = useState<Set<string>>(new Set());
  }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getToolDisplayName = (name: string) => {
    if (name === 'web_search') return 'Web Search';
    if (name === 'web_fetch') return 'Web Fetch';
    
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat session on mount
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('🚫 Not authenticated, skipping session load');
      return;
    }

    const loadSession = async () => {
      try {
        setIsLoadingSession(true);
        console.log('🔄 Loading chat session...', { chatId, isAuthenticated });
        
        let session: ChatSessionType | null = null;
        
        if (chatId) {
          session = await chatService.getSession(chatId);
        } else {
          session = await chatService.getCurrentSession();
        }

        if (session) {
          setCurrentSession(session);
          
          if (session.messages && session.messages.length > 0) {
            const formattedMessages = session.messages.map(msg => ({
              id: msg.id,
              role: msg.role.toLowerCase() as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              model: msg.model || undefined,
              toolCalls: [] // TODO: Load from tool executions
            }));
            setMessages(formattedMessages);
          }
        }
      } catch (error) {
        console.error('❌ Error loading chat session:', error);
      } finally {
        setIsLoadingSession(false);
      }
    };

    loadSession();
  }, [isAuthenticated, chatId]);

  // Enhanced WebSocket event handlers
  useEffect(() => {
    if (!socket) return;

    // Handle streaming start
    const handleStreamStart = ({ messageId }: { messageId: string }) => {
      console.log('🔄 Stream started:', messageId);
      setStreamingMessageId(messageId);
      setIsLoading(false);
      
      const assistantMessage: EnhancedMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        toolCalls: []
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    };

    // Handle text streaming
    const handleStream = ({ messageId, type, content }: { 
      messageId: string; 
      type: string; 
      content: string;
    }) => {
      // Only add text content to message content, tool_result will be handled by ToolInvocation components
      if (type === 'text') {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: msg.content + content }
            : msg
        ));
      }
    };

    // Handle tool execution start
    const handleToolStart = ({ messageId, toolName, arguments: args }: {
      messageId: string;
      toolName: string;
      arguments: any;
    }) => {
      console.log('🛠️ Tool started:', { toolName });
      
      const toolId = `tool-${Date.now()}-${Math.random()}`;
      const displayName = getToolDisplayName(toolName);
      
      // Add to executing tools for ThinkingIndicator
      setExecutingTools(prev => [...prev, {
        id: toolId,
        name: toolName,
        status: 'executing',
        displayName
      }]);
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const newToolCall: ToolCall = {
            id: toolId,
            name: toolName,
            arguments: args,
            status: 'executing'
          };
          
          return {
            ...msg,
            toolCalls: [...(msg.toolCalls || []), newToolCall]
          };
        }
        return msg;
      }));
    };

    // Handle tool execution result
    const handleToolResult = ({ messageId, toolName, result, success }: {
      messageId: string;
      toolName: string;
      result: any;
      success: boolean;
    }) => {
      console.log('✅ Tool completed:', { toolName, success });
      
      // Remove from executing tools
      setExecutingTools(prev => prev.filter(tool => tool.name !== toolName));
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            toolCalls: msg.toolCalls?.map(tool =>
              tool.name === toolName && tool.status === 'executing'
                ? { 
                    ...tool, 
                    status: success ? 'completed' : 'error',
                    result: result
                  }
                : tool
            )
          };
        }
        return msg;
      }));
    };

    // Handle stream completion
    const handleStreamComplete = ({ messageId, message }: { 
      messageId: string; 
      message: any;
    }) => {
      setStreamingMessageId(null);
      setExecutingTools([]); // Clear all executing tools when stream completes
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { 
              ...msg, 
              content: message.content,
              isStreaming: false,
              toolCalls: message.toolCalls?.map((tc: any) => ({
                id: tc.id || `tool-${Date.now()}-${Math.random()}`,
                name: tc.name,
                arguments: tc.arguments,
                status: tc.status || 'completed',
                result: tc.result,
                executionTime: tc.executionTime
              })) || msg.toolCalls
            }
          : msg
      ));
    };

    // Handle tool approval requests
    const handleToolApprovalRequired = (request: ToolApprovalRequest) => {
      console.log('🔐 Tool approval required:', request);
      setPendingApproval(request);
    };

    // Handle tool denial
    const handleToolDenied = ({ messageId, toolName, reason }: {
      messageId: string;
      toolName: string;
      reason?: string;
    }) => {
      console.log('❌ Tool denied:', { toolName, reason });
      
      // Remove from executing tools
      setExecutingTools(prev => prev.filter(tool => tool.name !== toolName));
      
      // Update tool status in message
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            toolCalls: msg.toolCalls?.map(tool =>
              tool.name === toolName
                ? { ...tool, status: 'error', result: { error: reason || 'Permission denied' } }
                : tool
            )
          };
        }
        return msg;
      }));
    };

    // Handle errors
    const handleError = ({ messageId, error }: { messageId?: string; error: string }) => {
      console.error('❌ Stream error:', error);
      setIsLoading(false);
      setStreamingMessageId(null);
      setExecutingTools([]); // Clear executing tools on error
      
      if (messageId) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: `❌ Error: ${error}`, isStreaming: false }
            : msg
        ));
      } else {
        // Add new error message
        const errorMessage: EnhancedMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ Error: ${error}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    };

    // Register event listeners
    socket.on('chat:stream_start', handleStreamStart);
    socket.on('chat:stream', handleStream);
    socket.on('chat:tool_start', handleToolStart);
    socket.on('chat:tool_result', handleToolResult);
    socket.on('chat:stream_complete', handleStreamComplete);
    socket.on('chat:error', handleError);
    socket.on('tool:approval_required', handleToolApprovalRequired);
    socket.on('chat:tool_denied', handleToolDenied);

    return () => {
      socket.off('chat:stream_start', handleStreamStart);
      socket.off('chat:stream', handleStream);
      socket.off('chat:tool_start', handleToolStart);
      socket.off('chat:tool_result', handleToolResult);
      socket.off('chat:stream_complete', handleStreamComplete);
      socket.off('chat:error', handleError);
      socket.off('tool:approval_required', handleToolApprovalRequired);
      socket.off('chat:tool_denied', handleToolDenied);
    };
  }, [socket]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket || isLoading) return;

    const userMessage: EnhancedMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setInputValue('');

    socket.emit('chat:message', {
      message: inputValue.trim(),
      model: selectedModel
    });

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  // Tool approval handlers
  const handleToolApproval = () => {
    if (!pendingApproval || !socket) return;
    
    const response: ToolApprovalResponse = {
      id: pendingApproval.id,
      approved: true,
      alwaysAllow: false
    };
    
    socket.emit('tool:approval_response', response);
    setPendingApproval(null);
  };

  const handleToolDeny = () => {
    if (!pendingApproval || !socket) return;
    
    const response: ToolApprovalResponse = {
      id: pendingApproval.id,
      approved: false
    };
    
    socket.emit('tool:approval_response', response);
    setPendingApproval(null);
  };

  const handleToolAlwaysAllow = () => {
    if (!pendingApproval || !socket) return;
    
    // Add to approved tools for this session
    setApprovedTools(prev => new Set([...prev, pendingApproval.toolName]));
    
    const response: ToolApprovalResponse = {
      id: pendingApproval.id,
      approved: true,
      alwaysAllow: true
    };
    
    socket.emit('tool:approval_response', response);
    setPendingApproval(null);
  };

  const getToolDisplayName = (name: string) => {
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };


  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {isLoadingSession ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-gray-400">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Welcome to NOWdev.ai</h3>
              <p className="text-gray-400 max-w-md">
                Ask me anything about your ServiceNow instance. I can help you create incidents, 
                manage catalog items, update records, and much more using natural language.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <Message 
              key={message.id} 
              message={{
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
                model: message.model,
                isStreaming: message.isStreaming,
                toolCalls: message.toolCalls
              }} 
            />
          ))
        )}
        
        {/* Show thinking indicator when tools are executing */}
        <ThinkingIndicator 
          isVisible={executingTools.length > 0}
          executingTools={executingTools}
          message={executingTools.length > 0 ? 'Executing ServiceNow operations...' : 'Thinking...'}
        />
        
        {isLoading && !streamingMessageId && executingTools.length === 0 && (
          <div className="flex items-center space-x-2 text-gray-400 bg-surface-light rounded-lg p-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div className="flex flex-col">
              <span className="text-white font-medium">NOWdev.ai Assistant</span>
              <span className="text-sm">Analyzing your request and planning workflow...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="flex space-x-4">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to do in ServiceNow..."
              className="w-full bg-surface-light border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-primary resize-none min-h-[52px] max-h-[200px]"
              disabled={isLoading}
              rows={1}
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || !socket?.connected}
            className="px-6 py-3 bg-primary text-black rounded-lg font-medium hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>Model: {selectedModel}</span>
        </div>
      </div>
      
      {/* Tool Approval Dialog */}
      <ToolApprovalDialog
        isOpen={!!pendingApproval}
        toolName={pendingApproval?.toolName || ''}
        toolDescription={pendingApproval?.toolDescription}
        toolArguments={pendingApproval?.toolArguments || {}}
        onApprove={handleToolApproval}
        onDeny={handleToolDeny}
        onAlwaysAllow={handleToolAlwaysAllow}
      />
    </div>
  );
};

export default EnhancedChatInterface;