import React from 'react';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface ToolCall {
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
}

interface ToolInvocationProps {
  toolCall: ToolCall;
}

const ToolInvocation: React.FC<ToolInvocationProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const getToolDisplayName = (name: string) => {
    // Remove namespace prefix and format for display
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'pending':
      case 'executing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Wrench className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (toolCall.status) {
      case 'pending':
        return 'Pending';
      case 'executing':
        return 'Executing...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Failed';
      default:
        return 'Queued';
    }
  };

  const getStatusColor = () => {
    switch (toolCall.status) {
      case 'pending':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'executing':
        return 'border-blue-500 bg-blue-500/10';
      case 'completed':
        return 'border-green-500 bg-green-500/10';
      case 'error':
        return 'border-red-500 bg-red-500/10';
      default:
        return 'border-gray-600 bg-gray-700/20';
    }
  };

  const formatArguments = (args: any) => {
    if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
      return 'No parameters required';
    }
    
    return JSON.stringify(args, null, 2);
  };

  const extractSysId = (result: any) => {
    if (!result || !result.content) return null;
    
    const content = result.content[0]?.text || '';
    const sysIdMatch = content.match(/sys_id['":\s]*([a-f0-9]{32})/i);
    return sysIdMatch ? sysIdMatch[1] : null;
  };

  const generateServiceNowLink = (sysId: string) => {
    const instanceUrl = import.meta.env.VITE_SERVICENOW_INSTANCE_URL;
    if (!instanceUrl) return null;
    return `${instanceUrl}/nav_to.do?uri=sys_id=${sysId}`;
  };

  const sysId = toolCall.result ? extractSysId(toolCall.result) : null;
  const serviceNowLink = sysId ? generateServiceNowLink(sysId) : null;

  return (
    <div className="my-2 border border-gray-700 rounded-lg bg-gray-800/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center gap-2 hover:bg-gray-700/50 transition-colors"
      >
        {getStatusIcon()}
        <span className="text-sm font-mono text-gray-300">
          {getToolDisplayName(toolCall.name)}
        </span>
        <span className="text-xs text-gray-500 ml-2">
          {getStatusText()}
        </span>
        <ChevronRight 
          className={`w-4 h-4 text-gray-500 ml-auto transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
      </button>
      
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-700">
          {toolCall.arguments && (
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">Parameters:</div>
              <pre className="text-xs bg-gray-900 p-2 rounded overflow-x-auto text-gray-300">
                {formatArguments(toolCall.arguments)}
              </pre>
            </div>
          )}
          
          {(toolCall.result || toolCall.status === 'error') && (
            <div>
              <div className="text-xs text-gray-500 mb-1">
                {toolCall.status === 'error' ? 'Error:' : 'Result:'}
              </div>
              <pre className={`text-xs p-2 rounded overflow-x-auto ${
                toolCall.status === 'error' ? 'bg-red-900/20 text-red-300' : 'bg-gray-900 text-gray-300'
              }`}>
                {toolCall.status === 'error' 
                  ? (toolCall.result?.content?.[0]?.text || 'Unknown error occurred')
                  : (toolCall.result?.content?.[0]?.text || 'Operation completed successfully')
                }
              </pre>
              
              {/* ServiceNow Link */}
              {serviceNowLink && toolCall.status === 'completed' && (
                <div className="mt-2 flex items-center space-x-2">
                  <a
                    href={serviceNowLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View in ServiceNow</span>
                  </a>
                  <span className="text-xs text-gray-500">({sysId})</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolInvocation;