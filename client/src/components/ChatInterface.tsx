import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Loader2 } from 'lucide-react';
import Message from './Message';
import ToolInvocation from './ToolInvocation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: any[];
  model?: string;
  isStreaming?: boolean;
}

interface ChatInterfaceProps {
  socket: Socket | null;
  selectedModel: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ socket, selectedModel }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message: ChatMessage) => {
      setMessages(prev => [...prev, { ...message, timestamp: new Date(message.timestamp) }]);
    };

    const handleStreamStart = ({ messageId }: { messageId: string }) => {
      setStreamingMessageId(messageId);
      setIsLoading(false);
      
      const assistantMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        toolCalls: []
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    };

    const handleStream = ({ messageId, type, content }: { messageId: string; type: string; content: string }) => {
      if (type === 'text') {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: msg.content + content }
            : msg
        ));
      }
    };

    const handleStreamComplete = ({ messageId, message }: { messageId: string; message: ChatMessage }) => {
      setStreamingMessageId(null);
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...message, timestamp: new Date(message.timestamp), isStreaming: false }
          : msg
      ));
    };

    const handleToolStart = ({ messageId, toolName, arguments: args }: { messageId: string; toolName: string; arguments: any }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const newToolCall = {
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

    const handleToolResult = ({ messageId, toolName, result, success }: { messageId: string; toolName: string; result: any; success: boolean }) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            toolCalls: msg.toolCalls?.map(tc => 
              tc.name === toolName 
                ? { ...tc, result, status: success ? 'completed' : 'error' }
                : tc
            )
          };
        }
        return msg;
      }));
    };

    const handleError = ({ message, error }: { message: string; error: string }) => {
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

    socket.on('chat:message', handleMessage);
    socket.on('chat:stream_start', handleStreamStart);
    socket.on('chat:stream', handleStream);
    socket.on('chat:stream_complete', handleStreamComplete);
    socket.on('chat:tool_start', handleToolStart);
    socket.on('chat:tool_result', handleToolResult);
    socket.on('chat:error', handleError);

    return () => {
      socket.off('chat:message', handleMessage);
      socket.off('chat:stream_start', handleStreamStart);
      socket.off('chat:stream', handleStream);
      socket.off('chat:stream_complete', handleStreamComplete);
      socket.off('chat:tool_start', handleToolStart);
      socket.off('chat:tool_result', handleToolResult);
      socket.off('chat:error', handleError);
    };
  }, [socket]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket || isLoading) return;

    const userMessage: ChatMessage = {
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

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-black" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Welcome to ServiceNow AI Assistant</h3>
              <p className="text-gray-400 max-w-md">
                Ask me anything about your ServiceNow instance. I can help you create incidents, 
                manage catalog items, update records, and much more using natural language.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id}>
              <Message message={message} />
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mt-4 space-y-2">
                  {message.toolCalls.map((toolCall, index) => (
                    <ToolInvocation key={index} toolCall={toolCall} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-400 bg-surface-light rounded-lg p-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div className="flex flex-col">
              <span className="text-white font-medium">ServiceNow AI Assistant</span>
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

export default ChatInterface;