import React from 'react';
import { AlertTriangle, Wrench, CheckCircle, XCircle, Info, Clock } from 'lucide-react';

interface ToolApprovalDialogProps {
  isOpen: boolean;
  toolName: string;
  toolDescription?: string;
  toolArguments: any;
  onApprove: () => void;
  onDeny: () => void;
  onAlwaysAllow?: () => void;
}

const ToolApprovalDialog: React.FC<ToolApprovalDialogProps> = ({
  isOpen,
  toolName,
  toolDescription,
  toolArguments,
  onApprove,
  onDeny,
  onAlwaysAllow
}) => {
  if (!isOpen) return null;

  const getToolDisplayName = (name: string) => {
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolIcon = () => {
    if (toolName.includes('create')) {
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    }
    if (toolName.includes('update') || toolName.includes('modify')) {
      return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    }
    if (toolName.includes('delete') || toolName.includes('remove')) {
      return <XCircle className="w-5 h-5 text-red-400" />;
    }
    if (toolName.includes('query') || toolName.includes('get') || toolName.includes('search')) {
      return <Info className="w-5 h-5 text-blue-400" />;
    }
    return <Wrench className="w-5 h-5 text-primary" />;
  };

  const getActionDescription = () => {
    if (toolName.includes('create')) {
      return 'This will create a new record in your ServiceNow instance.';
    }
    if (toolName.includes('update') || toolName.includes('modify')) {
      return 'This will modify an existing record in your ServiceNow instance.';
    }
    if (toolName.includes('delete') || toolName.includes('remove')) {
      return 'This will permanently delete a record from your ServiceNow instance.';
    }
    if (toolName.includes('query') || toolName.includes('get') || toolName.includes('search')) {
      return 'This will retrieve information from your ServiceNow instance.';
    }
    return 'This will perform an operation on your ServiceNow instance.';
  };

  const formatArguments = (args: any) => {
    if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
      return <div className="text-gray-400 text-sm italic">No parameters</div>;
    }
    
    return Object.entries(args).map(([key, value]) => (
      <div key={key} className="flex flex-col gap-1">
        <span className="text-gray-400 text-sm font-medium capitalize">
          {key.replace(/_/g, ' ')}:
        </span>
        <div className="text-gray-200 text-sm bg-gray-800/50 px-3 py-2 rounded border border-gray-700">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </div>
      </div>
    ));
  };

  const getRiskLevel = () => {
    if (toolName.includes('delete') || toolName.includes('remove')) {
      return { level: 'high', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/30' };
    }
    if (toolName.includes('create') || toolName.includes('update') || toolName.includes('modify')) {
      return { level: 'medium', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/30' };
    }
    return { level: 'low', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/30' };
  };

  const risk = getRiskLevel();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {getToolIcon()}
            <div>
              <h3 className="text-lg font-semibold text-gray-100">
                Tool Permission Required
              </h3>
              <p className="text-sm text-gray-400">
                Claude wants to use a ServiceNow tool
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {/* Tool Info */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-200 font-medium">
                {getToolDisplayName(toolName)}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full border ${risk.bgColor} ${risk.color}`}>
                {risk.level} risk
              </span>
            </div>
            
            {toolDescription && (
              <p className="text-sm text-gray-300 mb-2">{toolDescription}</p>
            )}
            
            <p className="text-sm text-gray-400">{getActionDescription()}</p>
          </div>

          {/* Parameters */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Parameters
            </h4>
            <div className="space-y-3">
              {formatArguments(toolArguments)}
            </div>
          </div>

          {/* Warning for destructive operations */}
          {risk.level === 'high' && (
            <div className="mb-4 p-3 rounded-md bg-red-900/20 border border-red-800/50">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-300">Destructive Operation</p>
                  <p className="text-xs text-red-200 mt-1">
                    This action cannot be undone. Please review the parameters carefully.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/30">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onDeny}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md transition-colors"
            >
              Deny
            </button>
            
            <div className="flex gap-2">
              {onAlwaysAllow && risk.level !== 'high' && (
                <button
                  onClick={onAlwaysAllow}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md transition-colors"
                >
                  Always Allow
                </button>
              )}
              
              <button
                onClick={onApprove}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light border border-primary rounded-md transition-colors"
              >
                Allow for This Chat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolApprovalDialog;