import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Wifi, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Zap,
  Server,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';

interface ConnectionStatus {
  websocket: {
    connected: boolean;
    latency?: number;
    lastPing?: Date;
  };
  mcp: {
    connected: boolean;
    poolStatus?: {
      total: number;
      available: number;
      inUse: number;
      waiting: number;
    };
    lastActivity?: Date;
  };
  database: {
    connected: boolean;
    responseTime?: number;
  };
  redis: {
    connected: boolean;
    responseTime?: number;
  };
}

interface ToolExecution {
  id: string;
  toolName: string;
  timestamp: Date;
  duration: number;
  status: 'success' | 'error';
  arguments: any;
  result?: any;
  error?: string;
}

interface QueueJob {
  id: string;
  name: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  timestamp: Date;
  attempts: number;
  progress?: number;
}

interface RateLimitStatus {
  remaining: number;
  total: number;
  resetTime: Date;
  blocked: boolean;
}

interface DeveloperToolsPanelProps {
  socket: any;
  onClose: () => void;
}

const DeveloperToolsPanel: React.FC<DeveloperToolsPanelProps> = ({ socket, onClose }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'tools' | 'queue' | 'limits'>('status');
  const [isVisible, setIsVisible] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    websocket: { connected: false },
    mcp: { connected: false },
    database: { connected: false },
    redis: { connected: false }
  });
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>({
    remaining: 100,
    total: 100,
    resetTime: new Date(Date.now() + 15 * 60 * 1000),
    blocked: false
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    // Request initial status
    requestStatusUpdate();

    // Set up event listeners
    socket.on('dev:status-update', handleStatusUpdate);
    socket.on('dev:tool-execution', handleToolExecution);
    socket.on('dev:queue-update', handleQueueUpdate);
    socket.on('dev:rate-limit-update', handleRateLimitUpdate);

    // Auto-refresh timer
    const refreshInterval = setInterval(() => {
      if (autoRefresh) {
        requestStatusUpdate();
      }
    }, 5000);

    return () => {
      socket.off('dev:status-update', handleStatusUpdate);
      socket.off('dev:tool-execution', handleToolExecution);
      socket.off('dev:queue-update', handleQueueUpdate);
      socket.off('dev:rate-limit-update', handleRateLimitUpdate);
      clearInterval(refreshInterval);
    };
  }, [socket, autoRefresh]);

  const requestStatusUpdate = () => {
    socket.emit('dev:get-status');
    socket.emit('dev:get-tool-history');
    socket.emit('dev:get-queue-status');
    socket.emit('dev:get-rate-limits');
  };

  const handleStatusUpdate = (status: ConnectionStatus) => {
    setConnectionStatus(status);
  };

  const handleToolExecution = (execution: ToolExecution) => {
    setToolExecutions(prev => [execution, ...prev.slice(0, 49)]); // Keep last 50
  };

  const handleQueueUpdate = (jobs: QueueJob[]) => {
    setQueueJobs(jobs);
  };

  const handleRateLimitUpdate = (limits: RateLimitStatus) => {
    setRateLimitStatus(limits);
  };

  const getStatusIcon = (connected: boolean) => {
    return connected ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getStatusColor = (connected: boolean) => {
    return connected ? 'text-green-600' : 'text-red-600';
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-gray-800 text-white p-2 rounded-full shadow-lg hover:bg-gray-700"
          title="Show Developer Tools"
        >
          <Eye className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-40 max-h-96 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-lg">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Developer Tools</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1 rounded ${autoRefresh ? 'text-green-600' : 'text-gray-400'}`}
            title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Hide Developer Tools"
          >
            <EyeOff className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Close Developer Tools"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'status', label: 'Status', icon: Server },
          { id: 'tools', label: 'Tools', icon: Zap },
          { id: 'queue', label: 'Queue', icon: Clock },
          { id: 'limits', label: 'Limits', icon: AlertCircle }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex-1 px-3 py-2 text-xs font-medium flex items-center justify-center space-x-1 ${
              activeTab === id
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'status' && (
          <div className="space-y-3">
            {/* WebSocket Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wifi className="w-4 h-4 text-gray-400" />
                <span className="text-sm">WebSocket</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(connectionStatus.websocket.connected)}
                <span className={`text-xs ${getStatusColor(connectionStatus.websocket.connected)}`}>
                  {connectionStatus.websocket.connected ? 'Connected' : 'Disconnected'}
                </span>
                {connectionStatus.websocket.latency && (
                  <span className="text-xs text-gray-500">
                    {connectionStatus.websocket.latency}ms
                  </span>
                )}
              </div>
            </div>

            {/* MCP Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-gray-400" />
                <span className="text-sm">MCP Server</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(connectionStatus.mcp.connected)}
                <span className={`text-xs ${getStatusColor(connectionStatus.mcp.connected)}`}>
                  {connectionStatus.mcp.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* MCP Pool Status */}
            {connectionStatus.mcp.poolStatus && (
              <div className="ml-6 p-2 bg-gray-50 rounded text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>Total: {connectionStatus.mcp.poolStatus.total}</div>
                  <div>Available: {connectionStatus.mcp.poolStatus.available}</div>
                  <div>In Use: {connectionStatus.mcp.poolStatus.inUse}</div>
                  <div>Waiting: {connectionStatus.mcp.poolStatus.waiting}</div>
                </div>
              </div>
            )}

            {/* Database Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-sm">Database</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(connectionStatus.database.connected)}
                <span className={`text-xs ${getStatusColor(connectionStatus.database.connected)}`}>
                  {connectionStatus.database.connected ? 'Connected' : 'Disconnected'}
                </span>
                {connectionStatus.database.responseTime && (
                  <span className="text-xs text-gray-500">
                    {connectionStatus.database.responseTime}ms
                  </span>
                )}
              </div>
            </div>

            {/* Redis Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-gray-400" />
                <span className="text-sm">Redis</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(connectionStatus.redis.connected)}
                <span className={`text-xs ${getStatusColor(connectionStatus.redis.connected)}`}>
                  {connectionStatus.redis.connected ? 'Connected' : 'Disconnected'}
                </span>
                {connectionStatus.redis.responseTime && (
                  <span className="text-xs text-gray-500">
                    {connectionStatus.redis.responseTime}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Recent Tool Executions</span>
              <span className="text-xs text-gray-500">{toolExecutions.length} executions</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {toolExecutions.map((execution) => (
                <div
                  key={execution.id}
                  className="p-2 bg-gray-50 rounded text-xs border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{execution.toolName}</span>
                    <div className="flex items-center space-x-2">
                      {execution.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="text-gray-500">
                        {formatDuration(execution.duration)}
                      </span>
                    </div>
                  </div>
                  <div className="text-gray-500">{formatTimeAgo(execution.timestamp)}</div>
                  {execution.error && (
                    <div className="mt-1 text-red-600 text-xs truncate">
                      Error: {execution.error}
                    </div>
                  )}
                </div>
              ))}
              {toolExecutions.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  No tool executions yet
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Queue Jobs</span>
              <span className="text-xs text-gray-500">{queueJobs.length} jobs</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {queueJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-2 bg-gray-50 rounded text-xs border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{job.name}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      job.status === 'failed' ? 'bg-red-100 text-red-800' :
                      job.status === 'active' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{formatTimeAgo(job.timestamp)}</span>
                    <span className="text-gray-500">Attempts: {job.attempts}</span>
                  </div>
                  {job.progress !== undefined && (
                    <div className="mt-1">
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className="bg-blue-600 h-1 rounded-full"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {queueJobs.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  No queued jobs
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'limits' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Rate Limiting</span>
              <span className={`px-2 py-1 rounded text-xs ${
                rateLimitStatus.blocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
              }`}>
                {rateLimitStatus.blocked ? 'Blocked' : 'Active'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Requests Remaining</span>
                <span className="text-sm font-medium">
                  {rateLimitStatus.remaining}/{rateLimitStatus.total}
                </span>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    rateLimitStatus.remaining / rateLimitStatus.total > 0.5 ? 'bg-green-500' :
                    rateLimitStatus.remaining / rateLimitStatus.total > 0.2 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${(rateLimitStatus.remaining / rateLimitStatus.total) * 100}%` }}
                ></div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Reset Time</span>
                <span>{formatTimeAgo(rateLimitStatus.resetTime)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeveloperToolsPanel;