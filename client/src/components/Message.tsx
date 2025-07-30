import React from 'react';
import { User, Bot, Clock } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: any[];
  model?: string;
  isStreaming?: boolean;
}

interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
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

  return (
    <div className={`flex space-x-4 ${message.role === 'user' ? 'justify-end' : ''}`}>
      {message.role === 'assistant' && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-black" />
          </div>
        </div>
      )}
      
      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-3xl`}>
        <div className={`rounded-lg px-4 py-3 ${
          message.role === 'user'
            ? 'bg-primary text-black'
            : 'bg-surface-light text-white'
        }`}>
          <div className="whitespace-pre-wrap">
            {formatContent(message.content)}
            {message.isStreaming && (
              <span className="inline-block w-2 h-5 bg-current animate-pulse ml-1" />
            )}
          </div>
        </div>
        
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