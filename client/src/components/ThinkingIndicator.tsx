import React from 'react';
import { Wrench, Search, Globe, Loader2 } from 'lucide-react';

interface ToolExecution {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  displayName: string;
}

interface ThinkingIndicatorProps {
  isVisible: boolean;
  executingTools?: ToolExecution[];
  message?: string;
}

const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ 
  isVisible, 
  executingTools = [], 
  message = "Thinking..." 
}) => {
  const getToolIcon = (toolName: string) => {
    if (toolName === 'web_search') return <Search className="w-3 h-3 text-blue-400" />;
    if (toolName === 'web_fetch') return <Globe className="w-3 h-3 text-green-400" />;
    return <Wrench className="w-3 h-3 text-primary" />;
  };

  const getToolDisplayName = (name: string) => {
    if (name === 'web_search') return 'Web Search';
    if (name === 'web_fetch') return 'Web Fetch';
    
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!isVisible) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 my-2 bg-gray-800/30 rounded-lg border border-gray-700/50">
      {/* Animated thinking dots */}
      <div className="flex items-center gap-1 mt-0.5">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" 
               style={{ animationDelay: '0ms', animationDuration: '1.4s' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" 
               style={{ animationDelay: '200ms', animationDuration: '1.4s' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" 
               style={{ animationDelay: '400ms', animationDuration: '1.4s' }}></div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {/* Main thinking message */}
        <div className="text-sm text-gray-300 mb-2">{message}</div>
        
        {/* Executing tools */}
        {executingTools.length > 0 && (
          <div className="space-y-1">
            {executingTools.map((tool) => (
              <div key={tool.id} className="flex items-center gap-2 text-xs text-gray-400">
                {getToolIcon(tool.name)}
                <span>{getToolDisplayName(tool.name)}</span>
                {tool.status === 'executing' && (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                )}
                <span className="text-gray-500">
                  {tool.status === 'pending' && '• Queued'}
                  {tool.status === 'executing' && '• Running'}
                  {tool.status === 'completed' && '• ✓'}
                  {tool.status === 'error' && '• ✗'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ThinkingIndicator;