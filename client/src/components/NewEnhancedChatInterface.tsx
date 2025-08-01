import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Loader2, Bot } from 'lucide-react';
import EnhancedMessage from './EnhancedMessage';
import StreamingMessageRenderer from './StreamingMessageRenderer';
import DevToolsIntegration from './DevToolsIntegration';
import ErrorBoundary from './ErrorBoundary';
import chatService, { ChatSession as ChatSessionType } from '../services/chat';
import { useAuth } from '../contexts/AuthContext';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  model?: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  currentTool?: string;
}

interface StreamingMessage {
  id: string;
  ref: React.RefObject<any>;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const [currentSession, setCurrentSession] = useState<ChatSessionType | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessageId]);

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

        console.log('✅ Session loaded:', session);

        if (session) {
          setCurrentSession(session);
          
          if (session.messages && session.messages.length > 0) {
            const formattedMessages = session.messages.map(msg => ({
              id: msg.id,
              role: msg.role.toLowerCase() as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              model: msg.model || undefined,
              toolCalls: [] // TODO: Load tool calls from database
            }));
            setMessages(formattedMessages);
          } else {
            setMessages([]);
          }
        } else {
          setMessages([]);
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

    const handleStreamStart = ({ messageId }: { messageId: string }) => {
      console.log('🚀 Stream started:', messageId);
      setStreamingMessageId(messageId);
      setIsLoading(false);
      
      // Create streaming message reference
      const streamingRef = React.createRef<any>();
      setStreamingMessages(prev => new Map(prev.set(messageId, { id: messageId, ref: streamingRef })));
      
      // Add initial assistant message
      const assistantMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        isThinking: true,
        toolCalls: []
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    };

    const handleThinking = ({ messageId }: { messageId: string }) => {
      console.log('🤔 AI thinking:', messageId);
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, isThinking: true, currentTool: undefined }
          : msg
      ));
    };

    const handleToolStart = ({ 
      messageId, 
      toolName, 
      arguments: args 
    }: { 
      messageId: string; 
      toolName: string; 
      arguments: any 
    }) => {
      console.log('🔧 Tool started:', { messageId, toolName });
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const newToolCall: ToolCall = {
            id: `${messageId}-${toolName}-${Date.now()}`,
            name: toolName,
            arguments: args,
            status: 'executing',
            startTime: new Date()
          };
          
          return {
            ...msg,
            isThinking: false,
            currentTool: toolName,
            toolCalls: [...(msg.toolCalls || []), newToolCall]
          };
        }
        return msg;
      }));

      // Notify streaming renderer if exists
      const streamingMsg = streamingMessages.get(messageId);
      if (streamingMsg?.ref.current?.handleToolStart) {
        streamingMsg.ref.current.handleToolStart(toolName, args);
      }
    };

    const handleToolProgress = ({ 
      messageId, 
      toolName, 
      progress 
    }: { 
      messageId: string; 
      toolName: string; 
      progress: number 
    }) => {
      console.log('📊 Tool progress:', { messageId, toolName, progress });
      // Update progress if needed (could add progress bar to tool invocation)
    };

    const handleToolComplete = ({ 
      messageId, 
      toolName, 
      result, 
      executionTime 
    }: { 
      messageId: string; 
      toolName: string; 
      result: any; 
      executionTime?: number 
    }) => {
      console.log('✅ Tool completed:', { messageId, toolName, executionTime });
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            currentTool: undefined,
            toolCalls: msg.toolCalls?.map(tc => 
              tc.name === toolName && tc.status === 'executing'
                ? { 
                    ...tc, 
                    result, 
                    status: 'completed' as const, 
                    executionTime,
                    endTime: new Date()
                  }
                : tc
            )
          };
        }
        return msg;
      }));

      // Notify streaming renderer
      const streamingMsg = streamingMessages.get(messageId);
      if (streamingMsg?.ref.current?.handleToolComplete) {
        streamingMsg.ref.current.handleToolComplete(toolName, result, executionTime);
      }
    };

    const handleToolError = ({ 
      messageId, 
      toolName, 
      error 
    }: { 
      messageId: string; 
      toolName: string; 
      error: string 
    }) => {
      console.error('❌ Tool failed:', { messageId, toolName, error });
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            currentTool: undefined,
            toolCalls: msg.toolCalls?.map(tc => 
              tc.name === toolName && tc.status === 'executing'
                ? { 
                    ...tc, 
                    status: 'error' as const, 
                    error,
                    endTime: new Date()
                  }
                : tc
            )
          };
        }
        return msg;
      }));

      // Notify streaming renderer
      const streamingMsg = streamingMessages.get(messageId);
      if (streamingMsg?.ref.current?.handleToolError) {
        streamingMsg.ref.current.handleToolError(toolName, error);
      }
    };

    const handleTextStream = ({ 
      messageId, 
      chunk 
    }: { 
      messageId: string; 
      chunk: string 
    }) => {
      console.log('📝 Text chunk received:', { messageId, chunk: chunk.substring(0, 50) + '...' });
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { 
              ...msg, 
              content: msg.content + chunk,
              isThinking: false,
              currentTool: undefined
            }
          : msg
      ));

      // Notify streaming renderer
      const streamingMsg = streamingMessages.get(messageId);
      if (streamingMsg?.ref.current?.handleTextChunk) {
        streamingMsg.ref.current.handleTextChunk(chunk);
      }
    };

    const handleStreamComplete = ({ 
      messageId, 
      finalMessage 
    }: { 
      messageId: string; 
      finalMessage?: ChatMessage 
    }) => {
      console.log('🏁 Stream completed:', messageId, 'finalMessage:', finalMessage);
      
      setStreamingMessageId(null);
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });
      
      // Only update if we have a valid finalMessage
      if (finalMessage) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { 
                ...finalMessage, 
                timestamp: finalMessage.timestamp ? new Date(finalMessage.timestamp) : new Date(), 
                isStreaming: false,
                isThinking: false,
                currentTool: undefined
              }
            : msg
        ));
      } else {
        // If no finalMessage, just update the streaming state
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { 
                ...msg,
                isStreaming: false,
                isThinking: false,
                currentTool: undefined
              }
            : msg
        ));
      }

      // Notify streaming renderer
      const streamingMsg = streamingMessages.get(messageId);
      if (streamingMsg?.ref.current?.handleComplete) {
        streamingMsg.ref.current.handleComplete();
      }
    };

    const handleError = ({ message, error }: { message: string; error: string }) => {
      console.error('💥 Chat error:', { message, error });
      setIsLoading(false);
      setStreamingMessageId(null);
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ Error: ${message}`,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    };

    // Register all event handlers
    socket.on('chat:stream_start', handleStreamStart);
    socket.on('chat:thinking', handleThinking);
    socket.on('chat:tool_start', handleToolStart);
    socket.on('chat:tool_progress', handleToolProgress);
    socket.on('chat:tool_complete', handleToolComplete);
    socket.on('chat:tool_error', handleToolError);
    socket.on('chat:text_stream', handleTextStream);
    socket.on('chat:stream_complete', (data: { messageId: string; message?: ChatMessage; finalMessage?: ChatMessage }) => {
      // Handle both message and finalMessage for backward compatibility
      const message = data.finalMessage || data.message;
      handleStreamComplete({
        messageId: data.messageId,
        finalMessage: message
      });
    });
    socket.on('chat:error', handleError);

    return () => {
      socket.off('chat:stream_start', handleStreamStart);
      socket.off('chat:thinking', handleThinking);
      socket.off('chat:tool_start', handleToolStart);
      socket.off('chat:tool_progress', handleToolProgress);
      socket.off('chat:tool_complete', handleToolComplete);
      socket.off('chat:tool_error', handleToolError);
      socket.off('chat:text_stream', handleTextStream);
      socket.off('chat:stream_complete');
      socket.off('chat:error', handleError);
    };
  }, [socket, streamingMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket || isLoading || streamingMessageId) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setInputValue('');

    socket.emit('chat:message', {
      message: inputValue.trim(),
      model: selectedModel,
      sessionId: currentSession?.id
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

  const handleRetryTool = (toolCall: ToolCall) => {
    if (!socket) return;
    
    socket.emit('chat:retry_tool', {
      toolCall,
      messageId: streamingMessageId
    });
  };

  const handleRetryMessage = () => {
    if (!socket || !streamingMessageId) return;
    
    socket.emit('chat:retry_message', {
      messageId: streamingMessageId
    });
  };

  return (
    <ErrorBoundary level="page">
      <div className="h-full flex flex-col bg-gray-900">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600">
        {isLoadingSession ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-400">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Welcome to ServiceNow MCP Assistant</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                I can help you manage your ServiceNow instance using natural language. 
                Ask me to create incidents, manage catalog items, update records, and much more.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <EnhancedMessage
              key={message.id}
              message={message}
              onRetryTool={message.isStreaming ? handleRetryTool : undefined}
            />
          ))
        )}
        
        {/* Loading state */}
        {isLoading && !streamingMessageId && (
          <div className="flex items-center space-x-3 text-gray-400 bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <div className="flex flex-col">
                <span className="text-white font-medium">ServiceNow Assistant</span>
                <span className="text-sm text-gray-400">Preparing response...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-6 bg-gray-800">
        <form onSubmit={handleSubmit} className="flex space-x-4">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to do in ServiceNow..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none min-h-[52px] max-h-[200px] transition-colors"
              disabled={isLoading || !!streamingMessageId}
              rows={1}
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || !!streamingMessageId || !socket?.connected}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[60px]"
          >
            {isLoading || streamingMessageId ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <div className="flex items-center space-x-2">
            <span>Model: {selectedModel}</span>
            {socket?.connected ? (
              <span className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                Connected
              </span>
            ) : (
              <span className="flex items-center">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                Disconnected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Developer Tools Integration */}
      <DevToolsIntegration 
        socket={socket} 
        onSendMessage={(message) => {
          setInputValue(message);
          // Trigger form submission after a brief delay to ensure state is updated
          setTimeout(() => {
            if (socket?.connected && message.trim()) {
              // Create a synthetic form event and submit
              const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true });
              Object.defineProperty(syntheticEvent, 'preventDefault', {
                value: () => {},
                writable: false
              });
              handleSubmit(syntheticEvent as any);
            }
          }, 100);
        }}
      />
    </div>
    </ErrorBoundary>
  );
};

export default EnhancedChatInterface;