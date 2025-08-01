import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
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

interface StreamingState {
  currentPhase: 'thinking' | 'tool_execution' | 'responding' | 'complete';
  message: string;
  toolCalls: ToolCall[];
  currentToolIndex: number;
  isTyping: boolean;
}

interface StreamingMessageRendererProps {
  messageId: string;
  initialContent?: string;
  onRetryTool?: (toolCall: ToolCall) => void;
  onRetryMessage?: () => void;
}

const StreamingMessageRenderer: React.FC<StreamingMessageRendererProps> = ({
  messageId,
  initialContent = '',
  onRetryTool,
  onRetryMessage
}) => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    currentPhase: 'thinking',
    message: initialContent,
    toolCalls: [],
    currentToolIndex: -1,
    isTyping: false
  });

  const [displayedMessage, setDisplayedMessage] = useState('');
  const [hasError, setHasError] = useState(false);

  // Simulate typing effect for message content
  useEffect(() => {
    if (streamingState.message !== displayedMessage) {
      const targetText = streamingState.message;
      const currentText = displayedMessage;
      
      if (targetText.length > currentText.length) {
        const timer = setTimeout(() => {
          setDisplayedMessage(targetText.slice(0, currentText.length + 1));
        }, 20); // Adjust typing speed here
        
        return () => clearTimeout(timer);
      } else if (targetText.length < currentText.length) {
        setDisplayedMessage(targetText);
      }
    }
  }, [streamingState.message, displayedMessage]);

  // Handle external streaming events
  const handleStreamUpdate = (update: Partial<StreamingState>) => {
    setStreamingState(prev => ({ ...prev, ...update }));
  };

  const handleToolStart = (toolName: string, args: any) => {
    setStreamingState(prev => {
      const newToolCall: ToolCall = {
        id: `${messageId}-tool-${prev.toolCalls.length}`,
        name: toolName,
        arguments: args,
        status: 'executing',
        startTime: new Date()
      };
      
      return {
        ...prev,
        currentPhase: 'tool_execution',
        toolCalls: [...prev.toolCalls, newToolCall],
        currentToolIndex: prev.toolCalls.length
      };
    });
  };

  const handleToolComplete = (toolName: string, result: any, executionTime?: number) => {
    setStreamingState(prev => ({
      ...prev,
      toolCalls: prev.toolCalls.map(tool => 
        tool.name === toolName && tool.status === 'executing'
          ? {
              ...tool,
              status: 'completed',
              result,
              executionTime,
              endTime: new Date()
            }
          : tool
      )
    }));
  };

  const handleToolError = (toolName: string, error: string) => {
    setHasError(true);
    setStreamingState(prev => ({
      ...prev,
      toolCalls: prev.toolCalls.map(tool => 
        tool.name === toolName && tool.status === 'executing'
          ? {
              ...tool,
              status: 'error',
              error,
              endTime: new Date()
            }
          : tool
      )
    }));
  };

  const handleTextChunk = (chunk: string) => {
    setStreamingState(prev => ({
      ...prev,
      currentPhase: 'responding',
      message: prev.message + chunk,
      isTyping: true
    }));
    
    // Stop typing indicator after a brief delay
    setTimeout(() => {
      setStreamingState(prev => ({ ...prev, isTyping: false }));
    }, 100);
  };

  const handleComplete = () => {
    setStreamingState(prev => ({
      ...prev,
      currentPhase: 'complete',
      isTyping: false
    }));
  };

  const formatContent = (content: string) => {
    // Handle markdown-style links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = content.split(linkRegex);
    
    return parts.map((part, index) => {
      if (index % 3 === 1) {
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
        return null;
      } else {
        return part.split('\n').map((line, lineIndex, lines) => (
          <React.Fragment key={`${index}-${lineIndex}`}>
            {line}
            {lineIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ));
      }
    });
  };

  const getPhaseIndicator = () => {
    switch (streamingState.currentPhase) {
      case 'thinking':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-md text-xs text-gray-400 mb-3">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking...</span>
          </div>
        );
      case 'tool_execution':
        const currentTool = streamingState.toolCalls[streamingState.currentToolIndex];
        if (currentTool && currentTool.status === 'executing') {
          return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 border border-blue-700/50 rounded-md text-xs text-blue-300 mb-3">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Using {currentTool.name.replace('servicenow-mcp:', '')}...</span>
            </div>
          );
        }
        break;
      case 'responding':
        if (streamingState.isTyping) {
          return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/20 border border-green-700/50 rounded-md text-xs text-green-300 mb-3">
              <div className="flex gap-1">
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce"></div>
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span>Responding...</span>
            </div>
          );
        }
        break;
    }
    return null;
  };

  const retryTool = (toolCall: ToolCall) => {
    if (onRetryTool) {
      onRetryTool(toolCall);
    }
  };

  // Expose handlers for parent component to call
  React.useImperativeHandle(React.createRef(), () => ({
    handleToolStart,
    handleToolComplete,
    handleToolError,
    handleTextChunk,
    handleComplete,
    handleStreamUpdate
  }));

  return (
    <div className="w-full">
      {/* Phase indicator */}
      {getPhaseIndicator()}

      {/* Message content */}
      {displayedMessage && (
        <div className="bg-gray-800 text-gray-100 border border-gray-700 rounded-lg px-4 py-3 mb-3">
          <div className="whitespace-pre-wrap break-words">
            {formatContent(displayedMessage)}
            {streamingState.isTyping && (
              <span className="inline-block w-2 h-5 bg-gray-400 animate-pulse ml-1" />
            )}
          </div>
        </div>
      )}

      {/* Tool invocations */}
      {streamingState.toolCalls.length > 0 && (
        <div className="space-y-2 mb-3">
          {streamingState.toolCalls.map((toolCall, index) => (
            <div key={toolCall.id || `tool-${index}`} className="relative">
              <EnhancedToolInvocationWithPrism
                toolCall={toolCall}
                isCompact={false}
                defaultExpanded={
                  toolCall.status === 'executing' || 
                  toolCall.status === 'error' ||
                  index === streamingState.currentToolIndex
                }
              />
              
              {/* Retry button for failed tools */}
              {toolCall.status === 'error' && onRetryTool && (
                <button
                  onClick={() => retryTool(toolCall)}
                  className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                  title="Retry tool execution"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error state with retry option */}
      {hasError && streamingState.currentPhase === 'complete' && onRetryMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-700/50 rounded-md text-red-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Some tools failed to execute properly.</span>
          <button
            onClick={onRetryMessage}
            className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Tool execution summary */}
      {streamingState.toolCalls.length > 0 && streamingState.currentPhase === 'complete' && (
        <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
          {streamingState.toolCalls.filter(t => t.status === 'completed').length > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              {streamingState.toolCalls.filter(t => t.status === 'completed').length} completed
            </span>
          )}
          {streamingState.toolCalls.filter(t => t.status === 'error').length > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              {streamingState.toolCalls.filter(t => t.status === 'error').length} failed
            </span>
          )}
          {streamingState.toolCalls.some(t => t.executionTime) && (
            <span>
              Total: {streamingState.toolCalls.reduce((sum, t) => sum + (t.executionTime || 0), 0)}ms
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingMessageRenderer;