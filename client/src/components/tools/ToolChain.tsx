import React from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import ToolInvocation from '../ToolInvocation';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
}

interface ToolChainProps {
  toolCalls: ToolCall[];
  isVertical?: boolean;
  showConnectors?: boolean;
  onRetryTool?: (toolCall: ToolCall) => void;
}

const ToolChain: React.FC<ToolChainProps> = ({
  toolCalls,
  isVertical = true,
  showConnectors = true,
  onRetryTool
}) => {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const getToolChainStatus = () => {
    const completed = toolCalls.filter(tc => tc.status === 'completed').length;
    const failed = toolCalls.filter(tc => tc.status === 'error').length;
    const executing = toolCalls.filter(tc => tc.status === 'executing').length;
    const pending = toolCalls.filter(tc => tc.status === 'pending').length;

    if (failed > 0) return 'error';
    if (executing > 0) return 'executing';
    if (pending > 0) return 'pending';
    if (completed === toolCalls.length) return 'completed';
    return 'unknown';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'executing': return 'text-blue-400';
      case 'error': return 'text-red-400';
      case 'pending': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const chainStatus = getToolChainStatus();

  return (
    <div className="space-y-3">
      {/* Chain Header */}
      {toolCalls.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-2 h-2 rounded-full ${
            chainStatus === 'completed' ? 'bg-green-400' :
            chainStatus === 'executing' ? 'bg-blue-400 animate-pulse' :
            chainStatus === 'error' ? 'bg-red-400' :
            'bg-yellow-400'
          }`} />
          <span className={`font-medium ${getStatusColor(chainStatus)}`}>
            Tool Chain ({toolCalls.length} operations)
          </span>
          <span className="text-gray-500 text-xs">
            {toolCalls.filter(tc => tc.status === 'completed').length} of {toolCalls.length} completed
          </span>
        </div>
      )}

      {/* Tool Chain */}
      <div className={`${isVertical ? 'space-y-2' : 'flex gap-2 overflow-x-auto'}`}>
        {toolCalls.map((toolCall, index) => (
          <div key={toolCall.id || `tool-${index}`} className="relative">
            {/* Tool Component */}
            <div className={isVertical ? '' : 'min-w-[300px]'}>
              <ToolInvocation
                toolCall={toolCall}
                defaultExpanded={toolCall.status === 'executing' || toolCall.status === 'error'}
              />
            </div>

            {/* Connector */}
            {showConnectors && index < toolCalls.length - 1 && (
              <div className={`flex items-center justify-center ${
                isVertical ? 'my-1' : 'absolute -right-4 top-1/2 transform -translate-y-1/2'
              }`}>
                <div className={`flex items-center ${
                  isVertical ? 'flex-col' : 'flex-row'
                }`}>
                  {isVertical ? (
                    <ArrowDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </div>
            )}

            {/* Retry Button for Failed Tools */}
            {toolCall.status === 'error' && onRetryTool && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => onRetryTool(toolCall)}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 transition-colors"
                >
                  Retry Tool
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chain Summary */}
      {toolCalls.length > 1 && chainStatus === 'completed' && (
        <div className="mt-3 p-3 bg-green-900/20 border border-green-800/50 rounded-md">
          <div className="flex items-center gap-2 text-sm text-green-300">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-medium">All operations completed successfully</span>
          </div>
          <div className="text-xs text-green-200 mt-1">
            Total execution time: {toolCalls.reduce((total, tc) => total + (tc.executionTime || 0), 0)}ms
          </div>
        </div>
      )}

      {/* Chain Error Summary */}
      {toolCalls.length > 1 && chainStatus === 'error' && (
        <div className="mt-3 p-3 bg-red-900/20 border border-red-800/50 rounded-md">
          <div className="flex items-center gap-2 text-sm text-red-300">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="font-medium">
              {toolCalls.filter(tc => tc.status === 'error').length} operation(s) failed
            </span>
          </div>
          <div className="text-xs text-red-200 mt-1">
            Some tools in the chain encountered errors. Check individual results above.
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolChain;