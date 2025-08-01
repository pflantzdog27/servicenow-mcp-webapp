import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Monitor, Cpu, Zap, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface DebugStatusPanelProps {
  socket: Socket | null;
  selectedModel: string;
}

interface ToolStatus {
  name: string;
  status: 'idle' | 'executing' | 'completed' | 'error';
  lastExecuted?: Date;
  executionCount: number;
  avgExecutionTime?: number;
}

interface SystemStatus {
  isConnected: boolean;
  model: string;
  availableTools: number;
  toolExecutions: ToolStatus[];
  lastActivity?: Date;
  messagesProcessed: number;
}

const DebugStatusPanel: React.FC<DebugStatusPanelProps> = ({ socket, selectedModel }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    isConnected: false,
    model: selectedModel,
    availableTools: 0,
    toolExecutions: [],
    messagesProcessed: 0
  });

  const [recentEvents, setRecentEvents] = useState<Array<{
    timestamp: Date;
    type: string;
    data: any;
  }>>([]);

  // Track system status and events
  useEffect(() => {
    if (!socket) return;

    const updateSystemStatus = (updates: Partial<SystemStatus>) => {
      setSystemStatus(prev => ({ ...prev, ...updates, lastActivity: new Date() }));
    };

    const addEvent = (type: string, data: any) => {
      setRecentEvents(prev => [
        { timestamp: new Date(), type, data },
        ...prev.slice(0, 9) // Keep last 10 events
      ]);
    };

    // Connection status
    const handleConnect = () => {
      updateSystemStatus({ isConnected: true });
      addEvent('connection', { status: 'connected' });
    };

    const handleDisconnect = () => {
      updateSystemStatus({ isConnected: false });
      addEvent('connection', { status: 'disconnected' });
    };

    // Tool events
    const handleToolStart = (data: { toolName: string; messageId: string; arguments: any }) => {
      updateSystemStatus({
        toolExecutions: systemStatus.toolExecutions.map(tool =>
          tool.name === data.toolName
            ? { ...tool, status: 'executing', lastExecuted: new Date() }
            : tool
        )
      });
      addEvent('tool_start', data);
    };

    const handleToolComplete = (data: { toolName: string; executionTime?: number }) => {
      updateSystemStatus({
        toolExecutions: systemStatus.toolExecutions.map(tool =>
          tool.name === data.toolName
            ? {
                ...tool,
                status: 'completed',
                executionCount: tool.executionCount + 1,
                avgExecutionTime: data.executionTime || tool.avgExecutionTime
              }
            : tool
        )
      });
      addEvent('tool_complete', data);
    };

    const handleToolError = (data: { toolName: string; error: string }) => {
      updateSystemStatus({
        toolExecutions: systemStatus.toolExecutions.map(tool =>
          tool.name === data.toolName
            ? { ...tool, status: 'error' }
            : tool
        )
      });
      addEvent('tool_error', data);
    };

    const handleStreamStart = (data: { messageId: string }) => {
      updateSystemStatus({
        messagesProcessed: systemStatus.messagesProcessed + 1
      });
      addEvent('message_start', data);
    };

    const handleStreamComplete = (data: any) => {
      addEvent('message_complete', data);
    };

    // Register event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('chat:tool_start', handleToolStart);
    socket.on('chat:tool_complete', handleToolComplete);
    socket.on('chat:tool_error', handleToolError);
    socket.on('chat:stream_start', handleStreamStart);
    socket.on('chat:stream_complete', handleStreamComplete);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('chat:tool_start', handleToolStart);
      socket.off('chat:tool_complete', handleToolComplete);
      socket.off('chat:tool_error', handleToolError);
      socket.off('chat:stream_start', handleStreamStart);
      socket.off('chat:stream_complete', handleStreamComplete);
    };
  }, [socket, systemStatus]);

  // Update model when it changes
  useEffect(() => {
    setSystemStatus(prev => ({ ...prev, model: selectedModel }));
  }, [selectedModel]);

  // Fetch initial tool count
  useEffect(() => {
    const fetchToolCount = async () => {
      try {
        const response = await fetch('/test-mcp/tools');
        const data = await response.json();
        if (data.success) {
          setSystemStatus(prev => ({ 
            ...prev, 
            availableTools: data.toolCount,
            toolExecutions: data.tools.map((tool: any) => ({
              name: tool.name,
              status: 'idle',
              executionCount: 0
            }))
          }));
        }
      } catch (error) {
        console.warn('Failed to fetch tool count:', error);
      }
    };

    fetchToolCount();
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg shadow-lg transition-colors"
        title="Show Debug Status"
      >
        <Monitor className="w-5 h-5 text-gray-300" />
      </button>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executing': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executing': return <Clock className="w-3 h-3 animate-spin" />;
      case 'completed': return <CheckCircle className="w-3 h-3" />;
      case 'error': return <AlertCircle className="w-3 h-3" />;
      default: return <Cpu className="w-3 h-3" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-96 bg-gray-900/95 backdrop-blur-sm border border-gray-600 rounded-lg shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Debug Status</span>
        </div>
        <button 
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ×
        </button>
      </div>

      {/* System Status */}
      <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">System</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Connection:</span>
              <span className={systemStatus.isConnected ? 'text-green-400' : 'text-red-400'}>
                {systemStatus.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Model:</span>
              <span className="text-white font-mono text-xs">{systemStatus.model}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Available Tools:</span>
              <span className="text-blue-400">{systemStatus.availableTools}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Messages Processed:</span>
              <span className="text-green-400">{systemStatus.messagesProcessed}</span>
            </div>
          </div>
        </div>

        {/* Active Tools */}
        {systemStatus.toolExecutions.filter(t => t.status !== 'idle' || t.executionCount > 0).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Active Tools</h4>
            <div className="space-y-1">
              {systemStatus.toolExecutions
                .filter(tool => tool.status !== 'idle' || tool.executionCount > 0)
                .slice(0, 5)
                .map(tool => (
                  <div key={tool.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(tool.status)}
                      <span className="text-gray-300 truncate max-w-32" title={tool.name}>
                        {tool.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`${getStatusColor(tool.status)} capitalize`}>
                        {tool.status}
                      </span>
                      {tool.executionCount > 0 && (
                        <span className="text-gray-500">({tool.executionCount})</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Recent Events */}
        {recentEvents.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Recent Events</h4>
            <div className="space-y-1">
              {recentEvents.slice(0, 5).map((event, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 min-w-16">
                    {event.timestamp.toLocaleTimeString().slice(0, 8)}
                  </span>
                  <span className="text-blue-400">{event.type}</span>
                  <span className="text-gray-400 truncate">
                    {event.data.toolName || event.data.status || event.data.messageId || 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Activity */}
        {systemStatus.lastActivity && (
          <div className="pt-2 border-t border-gray-700">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Last Activity:</span>
              <span className="text-gray-300">
                {systemStatus.lastActivity.toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugStatusPanel;