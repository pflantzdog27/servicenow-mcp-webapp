import React, { useState, useEffect } from 'react';
import { User, Bot, Clock, Loader2 } from 'lucide-react';
import EnhancedToolInvocationWithPrism from './EnhancedToolInvocationWithPrism';

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

interface EnhancedMessageProps {
  message: ChatMessage;
  onRetryTool?: (toolCall: ToolCall) => void;
}

const EnhancedMessage: React.FC<EnhancedMessageProps> = ({ message, onRetryTool }) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Debug logging for tool invocations
  useEffect(() => {
    if (message.toolCalls && message.toolCalls.length > 0) {
      console.log(`🔧 [EnhancedMessage] Message ${message.id} has ${message.toolCalls.length} tool calls:`, {
        messageId: message.id,
        toolCalls: message.toolCalls.map(tc => ({
          name: tc.name,
          status: tc.status,
          hasResult: !!tc.result,
          hasError: !!tc.error
        })),
        role: message.role,
        isStreaming: message.isStreaming
      });
    }
  }, [message.toolCalls, message.id]);

  // Simulate typing effect for assistant messages during streaming
  useEffect(() => {
    if (message.role === 'assistant' && message.isStreaming) {
      setIsTyping(true);
      const timer = setTimeout(() => setIsTyping(false), 100);
      return () => clearTimeout(timer);
    }
  }, [message.content, message.isStreaming]);

  // Update displayed content for streaming
  useEffect(() => {
    if (message.role === 'assistant' && message.isStreaming) {
      setDisplayedContent(message.content);
    } else {
      setDisplayedContent(message.content);
    }
  }, [message.content, message.isStreaming]);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatContent = (content: string) => {
    // Handle markdown-style links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = content.split(linkRegex);
    
    return parts.map((part, index) => {
      if (index % 3 === 1) {
        // This is link text
        const url = parts[index + 1];
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline decoration-dotted transition-colors"
          >
            {part}
          </a>
        );
      } else if (index % 3 === 2) {
        // This is the URL, skip it
        return null;
      } else {
        // Regular text with line breaks preserved
        return part.split('\n').map((line, lineIndex, lines) => (
          <React.Fragment key={`${index}-${lineIndex}`}>
            {line}
            {lineIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ));
      }
    });
  };

  const getThinkingMessage = () => {
    if (message.isThinking) {
      return "Thinking about your request...";
    }
    if (message.currentTool) {
      return `Using ${message.currentTool}...`;
    }
    return null;
  };

  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const pendingTools = message.toolCalls?.filter(t => t.status === 'pending').length || 0;
  const executingTools = message.toolCalls?.filter(t => t.status === 'executing').length || 0;
  const completedTools = message.toolCalls?.filter(t => t.status === 'completed').length || 0;
  const failedTools = message.toolCalls?.filter(t => t.status === 'error').length || 0;

  return (
    <div className={`flex space-x-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
      {message.role === 'assistant' && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
      
      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-4xl w-full`}>
        
        {/* Thinking indicator */}
        {(message.isThinking || message.currentTool) && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-md text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{getThinkingMessage()}</span>
          </div>
        )}

        {/* Main message content */}
        {displayedContent && (
          <div className={`rounded-lg px-4 py-3 max-w-none ${
            message.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-100 border border-gray-700'
          }`}>
            <div className="whitespace-pre-wrap break-words" data-message-id={message.id}>
              {formatContent(displayedContent)}
              {message.isStreaming && isTyping && (
                <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1" />
              )}
            </div>
          </div>
        )}

        {/* Tool invocations - integrated inline */}
        {hasToolCalls && (
          <div className="w-full mt-3 space-y-2">
            {message.toolCalls!.map((toolCall, index) => (
              <EnhancedToolInvocationWithPrism
                key={toolCall.id || `tool-${message.id}-${index}`}
                toolCall={toolCall}
                isCompact={false}
                defaultExpanded={toolCall.status === 'executing' || toolCall.status === 'error'}
              />
            ))}
          </div>
        )}

        {/* Tool execution summary */}
        {hasToolCalls && message.role === 'assistant' && !message.isStreaming && (
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            {completedTools > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                {completedTools} completed
              </span>
            )}
            {executingTools > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                {executingTools} running
              </span>
            )}
            {pendingTools > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                {pendingTools} queued
              </span>
            )}
            {failedTools > 0 && (
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                {failedTools} failed
              </span>
            )}
          </div>
        )}
        
        {/* Message metadata */}
        <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatTime(message.timestamp)}</span>
          {message.model && message.role === 'assistant' && (
            <>
              <span>•</span>
              <span>{message.model}</span>
            </>
          )}
          {hasToolCalls && (
            <>
              <span>•</span>
              <span>{message.toolCalls!.length} tool{message.toolCalls!.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>
      
      {message.role === 'user' && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-300" />
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedMessage;