import React, { useState } from 'react';
import { User, Bot, Clock, Wrench, ChevronDown } from 'lucide-react';
import EnhancedToolInvocationWithPrism from './EnhancedToolInvocationWithPrism';
import ToolChain from './tools/ToolChain';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  model?: string;
  isStreaming?: boolean;
}

interface MessageProps {
  message: ChatMessage;
  onRetryTool?: (toolCall: ToolCall) => void;
}

const Message: React.FC<MessageProps> = ({ message, onRetryTool }) => {
  const [showTools, setShowTools] = useState(false);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatContent = (content: string) => {
    // Convert ServiceNow record links
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
            className="text-primary hover:text-blue-400 underline decoration-dotted"
          >
            {part}
          </a>
        );
      } else if (index % 3 === 2) {
        // This is the URL, skip it
        return null;
      } else {
        // Regular text
        return part;
      }
    });
  };

  const hasTools = message.toolCalls && message.toolCalls.length > 0;
  const completedTools = message.toolCalls?.filter(tool => tool.status === 'completed').length || 0;

  return (
    <div className={`flex space-x-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
      {message.role === 'assistant' && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-black" />
          </div>
        </div>
      )}
      
      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-3xl w-full`}>
        {/* Main message content */}
        <div className={`rounded-lg px-4 py-3 ${
          message.role === 'user'
            ? 'bg-primary text-black'
            : 'bg-surface-light text-white'
        }`}>
          <div className="whitespace-pre-wrap" data-message-id={message.id}>
            {formatContent(message.content)}
            {message.isStreaming && (
              <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1" />
            )}
          </div>
        </div>
        
        {/* Tool invocations toggle button */}
        {hasTools && message.role === 'assistant' && (
          <button
            onClick={() => setShowTools(!showTools)}
            className="flex items-center gap-2 px-3 py-1.5 mt-2 text-xs text-gray-400 hover:text-gray-300 bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700/50 rounded-md transition-colors"
          >
            <Wrench className="w-3 h-3" />
            <span>
              {message.toolCalls!.length} tool{message.toolCalls!.length !== 1 ? 's' : ''} used
              {completedTools > 0 && completedTools < message.toolCalls!.length && (
                <span className="text-gray-500"> • {completedTools} completed</span>
              )}
            </span>
            <ChevronDown 
              className={`w-3 h-3 transition-transform duration-200 ${
                showTools ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
        
        {/* Tool invocations (collapsible) */}
        {hasTools && showTools && message.role === 'assistant' && (
          <div className="w-full mt-2 animate-in slide-in-from-top-2 duration-200">
            {/* Use ToolChain for multiple tools, individual components for single tools */}
            {message.toolCalls!.length > 1 ? (
              <ToolChain
                toolCalls={message.toolCalls!}
                isVertical={true}
                showConnectors={true}
                onRetryTool={onRetryTool}
              />
            ) : (
              message.toolCalls!.map((toolCall, index) => (
                <EnhancedToolInvocationWithPrism
                  key={toolCall.id || `${message.id}-tool-${index}`}
                  toolCall={toolCall}
                  isCompact={false}
                  defaultExpanded={false}
                />
              ))
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
        </div>
      </div>
      
      {message.role === 'user' && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-surface-light rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;