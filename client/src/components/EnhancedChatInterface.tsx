import React, { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Loader2 } from 'lucide-react';
import Message from './Message';
import ToolInvocation from './ToolInvocation';
import { useAuth } from '../contexts/AuthContext';
import chatService, { ChatSession as ChatSessionType } from '../services/chat';

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocationData[];
  timestamp: Date;
  model?: string;
  isStreaming?: boolean;
}

interface ToolInvocationData {
  id: string;
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'error';
  result?: any;
  error?: string;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
              toolInvocations: [] // TODO: Load from tool executions
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
        toolInvocations: []
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    };

    // Handle text streaming
    const handleStream = ({ messageId, type, content }: { 
      messageId: string; 
      type: string; 
      content: string;
    }) => {
      if (type === 'text' || type === 'tool_result') {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: msg.content + content }
            : msg
        ));
      }
    };

    // Handle tool execution start
    const handleToolStart = ({ messageId, toolId, toolName, arguments: args }: {
      messageId: string;
      toolId: string;
      toolName: string;
      arguments: any;
    }) => {
      console.log('🛠️ Tool started:', { toolId, toolName });
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const newToolInvocation: ToolInvocationData = {
            id: toolId,
            name: toolName,
            arguments: args,
            status: 'executing'
          };
          
          return {
            ...msg,
            toolInvocations: [...(msg.toolInvocations || []), newToolInvocation]
          };
        }
        return msg;
      }));
    };

    // Handle tool execution result
    const handleToolResult = ({ messageId, toolId, toolName, result, success }: {
      messageId: string;
      toolId: string;
      toolName: string;
      result: any;
      success: boolean;
    }) => {
      console.log('✅ Tool completed:', { toolId, toolName, success });
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            toolInvocations: msg.toolInvocations?.map(inv =>
              inv.id === toolId
                ? { 
                    ...inv, 
                    status: success ? 'completed' : 'error',
                    result: success ? result : undefined,
                    error: success ? undefined : result?.error || 'Tool execution failed'
                  }
                : inv
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
      console.log('🏁 Stream completed:', messageId);
      setStreamingMessageId(null);
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { 
              ...msg, 
              content: message.content,
              isStreaming: false,
              toolInvocations: message.toolCalls?.map((tc: any) => ({
                id: `tool-${Date.now()}-${Math.random()}`,
                name: tc.name,
                arguments: tc.arguments,
                status: tc.status || 'completed',
                result: tc.result
              })) || msg.toolInvocations
            }
          : msg
      ));
    };

    // Handle errors
    const handleError = ({ messageId, error }: { messageId?: string; error: string }) => {
      console.error('❌ Stream error:', error);
      setIsLoading(false);
      setStreamingMessageId(null);
      
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

    return () => {
      socket.off('chat:stream_start', handleStreamStart);
      socket.off('chat:stream', handleStream);
      socket.off('chat:tool_start', handleToolStart);
      socket.off('chat:tool_result', handleToolResult);
      socket.off('chat:stream_complete', handleStreamComplete);
      socket.off('chat:error', handleError);
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

  const renderMessage = (message: EnhancedMessage) => {
    // Parse message content and insert tool invocations
    const parts = message.content.split(/\[TOOL_INVOCATION_(\d+)\]/);
    const elements: React.ReactNode[] = [];
    
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        // Text content
        if (part.trim()) {
          elements.push(
            <div key={`text-${index}`} className="whitespace-pre-wrap">
              {part}
            </div>
          );
        }
      } else {
        // Tool invocation placeholder - render actual tool invocation
        const invocationIndex = parseInt(part);
        const invocation = message.toolInvocations?.[invocationIndex];
        if (invocation) {
          elements.push(
            <ToolInvocation
              key={`tool-${invocation.id}`}
              toolCall={{
                name: invocation.name,
                arguments: invocation.arguments,
                status: invocation.status,
                result: invocation.result
              }}
            />
          );
        }
      }
    });
    
    // If no tool invocation placeholders were found, render tool invocations at the end
    if (!message.content.includes('[TOOL_INVOCATION_') && message.toolInvocations) {
      message.toolInvocations.forEach((invocation) => {
        elements.push(
          <ToolInvocation
            key={`tool-${invocation.id}`}
            toolCall={{
              name: invocation.name,
              arguments: invocation.arguments,
              status: invocation.status,
              result: invocation.result
            }}
          />
        );
      });
    }
    
    return (
      <div className="space-y-2">
        {elements.length > 0 ? elements : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    );
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
            <div key={message.id}>
              {message.role === 'user' ? (
                <Message message={{
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp
                }} />
              ) : (
                <div className="space-y-2">
                  <Message message={{
                    id: message.id,
                    role: message.role,
                    content: message.content.split(/\[TOOL_INVOCATION_\d+\]/).join('').trim() || 'Working on your request...',
                    timestamp: message.timestamp,
                    model: message.model,
                    isStreaming: message.isStreaming
                  }} />
                  {renderMessage(message)}
                </div>
              )}
            </div>
          ))
        )}
        
        {isLoading && !streamingMessageId && (
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
    </div>
  );
};

export default EnhancedChatInterface;