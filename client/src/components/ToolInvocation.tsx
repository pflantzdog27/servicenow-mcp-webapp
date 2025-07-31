import React from 'react';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink 
} from 'lucide-react';

interface ToolCall {
  name: string;
  arguments: any;
  result?: any;
  status: 'executing' | 'completed' | 'error';
}

interface ToolInvocationProps {
  toolCall: ToolCall;
}

const ToolInvocation: React.FC<ToolInvocationProps> = ({ toolCall }) => {
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'executing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Wrench className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (toolCall.status) {
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
      case 'executing':
        return 'border-primary bg-primary/5';
      case 'completed':
        return 'border-success bg-success/5';
      case 'error':
        return 'border-red-500 bg-red-500/5';
      default:
        return 'border-gray-600 bg-gray-700/20';
    }
  };

  const formatArguments = (args: any) => {
    if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
      return <span className="text-gray-500 italic">No parameters required</span>;
    }
    
    return Object.entries(args).map(([key, value]) => (
      <div key={key} className="flex">
        <span className="text-gray-400 min-w-0 flex-shrink-0">{key}:</span>
        <span className="text-white ml-2 break-all">
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </span>
      </div>
    ));
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
    <div className={`border rounded-lg p-4 transition-all ${getStatusColor()} mb-3`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <span className="font-medium text-white text-lg">{toolCall.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            <div className="text-sm text-gray-400">{getStatusText()}</div>
          </div>
        </div>
      </div>
      
      {/* Arguments */}
      <div className="mb-3">
        <div className="text-sm text-gray-400 mb-1">Parameters:</div>
        <div className="bg-surface-light rounded p-2 text-xs font-mono space-y-1">
          {formatArguments(toolCall.arguments)}
        </div>
      </div>
      
      {/* Result */}
      {toolCall.result && (
        <div>
          <div className="text-sm text-gray-400 mb-1">Result:</div>
          <div className="bg-surface-light rounded p-2 text-xs">
            {toolCall.status === 'error' ? (
              <div className="text-red-400">
                {toolCall.result.content?.[0]?.text || 'Unknown error occurred'}
              </div>
            ) : (
              <div className="text-success">
                {toolCall.result.content?.[0]?.text || 'Operation completed successfully'}
              </div>
            )}
          </div>
          
          {/* ServiceNow Link */}
          {serviceNowLink && toolCall.status === 'completed' && (
            <div className="mt-2 flex items-center space-x-2">
              <a
                href={serviceNowLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-primary hover:text-blue-400 text-sm"
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
  );
};

export default ToolInvocation;