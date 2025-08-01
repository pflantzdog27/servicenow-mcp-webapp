import React from 'react';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink,
  ChevronDown,
  Search,
  Globe,
  Clock
} from 'lucide-react';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
}

interface ToolInvocationProps {
  toolCall: ToolCall;
  isCompact?: boolean;
  defaultExpanded?: boolean;
}

const ToolInvocation: React.FC<ToolInvocationProps> = ({ 
  toolCall, 
  isCompact = false,
  defaultExpanded = false 
}) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  
  const getToolDisplayName = (name: string) => {
    if (name === 'web_search') return 'Web Search';
    if (name === 'web_fetch') return 'Web Fetch';
    
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolIcon = () => {
    if (toolCall.name === 'web_search') return <Search className="w-4 h-4 text-blue-400" />;
    if (toolCall.name === 'web_fetch') return <Globe className="w-4 h-4 text-green-400" />;
    return <Wrench className="w-4 h-4 text-primary" />;
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'executing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (toolCall.status) {
      case 'pending': return 'Queued';
      case 'executing': return 'Running...';
      case 'completed': return 'Completed';
      case 'error': return 'Failed';
      default: return 'Unknown';
    }
  };

  const getStatusBadgeColor = () => {
    switch (toolCall.status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'executing': return 'bg-primary/20 text-primary border-primary/30';
      case 'completed': return 'bg-success/20 text-success border-success/30';
      case 'error': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-gray-600/20 text-gray-300 border-gray-600/30';
    }
  };

  const formatArguments = (args: any) => {
    if (!args || typeof args !== 'object' || Object.keys(args).length === 0) {
      return 'No parameters';
    }
    
    return Object.entries(args).map(([key, value]) => (
      <div key={key} className="flex flex-col gap-1">
        <span className="text-gray-400 text-xs font-medium">{key}:</span>
        <span className="text-gray-200 text-xs font-mono bg-gray-800/50 px-2 py-1 rounded border border-gray-700">
          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        </span>
      </div>
    ));
  };

  const formatWebSearchResults = (result: any) => {
    if (!result?.result?.results) return null;
    
    const searchResults = result.result.results;
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-400 mb-2">
          Found {searchResults.length} results in {result.result.searchTime}ms
        </div>
        {searchResults.slice(0, 3).map((searchResult: any, index: number) => (
          <div key={index} className="border border-gray-700/50 rounded-md p-2 bg-gray-800/30 hover:bg-gray-800/50 transition-colors">
            <div className="flex items-start gap-2 mb-1">
              <div className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded text-center min-w-[20px]">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <a 
                  href={searchResult.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-300 hover:text-blue-200 transition-colors line-clamp-1 flex items-center gap-1"
                >
                  {searchResult.title}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
                <div className="text-xs text-gray-500 mt-0.5">{searchResult.domain}</div>
              </div>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">{searchResult.snippet}</p>
          </div>
        ))}
        {searchResults.length > 3 && (
          <div className="text-xs text-gray-400 text-center py-1">
            ...and {searchResults.length - 3} more results
          </div>
        )}
      </div>
    );
  };

  const formatWebFetchResults = (result: any) => {
    if (!result?.result) return null;
    
    const content = result.result;
    return (
      <div className="border border-gray-700/50 rounded-md p-3 bg-gray-800/30">
        <div className="flex items-start gap-2 mb-2">
          <Globe className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <a 
              href={content.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm font-medium text-green-300 hover:text-green-200 transition-colors break-all flex items-center gap-1"
            >
              {content.title}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
            <div className="text-xs text-gray-500 mt-1">
              {content.domain} • {content.contentType} • {content.metadata.readingTime} min read
            </div>
          </div>
        </div>
        
        {content.metadata.breadcrumbs && content.metadata.breadcrumbs.length > 0 && (
          <div className="text-xs text-gray-400 mb-2">
            {content.metadata.breadcrumbs.join(' > ')}
          </div>
        )}
        
        <div className="text-xs text-gray-300 leading-relaxed">
          <div className="font-medium mb-1">Content Preview:</div>
          <div className="line-clamp-3">{content.excerpt}</div>
        </div>
      </div>
    );
  };

  const formatStandardResults = (result: any) => {
    if (!result) return 'No result available';
    
    if (result.content && result.content[0]?.text) {
      return result.content[0].text;
    }
    
    if (typeof result === 'string') return result;
    
    return JSON.stringify(result, null, 2);
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

  if (isCompact) {
    return (
      <div className="inline-flex items-center gap-2 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-xs">
        {getToolIcon()}
        <span className="text-gray-300">{getToolDisplayName(toolCall.name)}</span>
        {getStatusIcon()}
      </div>
    );
  }

  return (
    <div className="my-2 border border-gray-600/50 rounded-lg bg-gray-800/20 backdrop-blur-sm overflow-hidden transition-all duration-200 hover:bg-gray-800/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {getToolIcon()}
          {getStatusIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-200">
              {getToolDisplayName(toolCall.name)}
            </span>
            <span className={`px-2 py-0.5 text-xs border rounded-full ${getStatusBadgeColor()}`}>
              {getStatusText()}
            </span>
            {toolCall.executionTime && (
              <span className="text-xs text-gray-500">
                {toolCall.executionTime}ms
              </span>
            )}
          </div>
          
          {/* Quick preview for completed tools */}
          {toolCall.status === 'completed' && toolCall.result && !isExpanded && (
            <div className="text-xs text-gray-400 truncate">
              {toolCall.name === 'web_search' && toolCall.result?.result?.results
                ? `Found ${toolCall.result.result.results.length} results`
                : toolCall.name === 'web_fetch' && toolCall.result?.result?.title
                ? `Fetched: ${toolCall.result.result.title}`
                : 'Click to view details'
              }
            </div>
          )}
        </div>
        
        <ChevronDown 
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-600/30 bg-gray-800/30 animate-in slide-in-from-top-2 duration-200">
          {/* Parameters */}
          {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                Parameters
              </div>
              <div className="space-y-2">
                {formatArguments(toolCall.arguments)}
              </div>
            </div>
          )}
          
          {/* Results */}
          {(toolCall.result || toolCall.status === 'error') && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                {toolCall.status === 'error' ? 'Error Details' : 'Results'}
              </div>
              
              {toolCall.status === 'error' ? (
                <div className="text-xs p-3 rounded-md bg-red-900/20 border border-red-800/50 text-red-200">
                  {toolCall.result?.content?.[0]?.text || toolCall.result?.error || 'Unknown error occurred'}
                </div>
              ) : toolCall.name === 'web_search' && toolCall.result ? (
                formatWebSearchResults(toolCall.result)
              ) : toolCall.name === 'web_fetch' && toolCall.result ? (
                formatWebFetchResults(toolCall.result)
              ) : (
                <div className="text-xs p-3 rounded-md bg-gray-900/50 border border-gray-700/50 text-gray-200 font-mono whitespace-pre-wrap">
                  {formatStandardResults(toolCall.result)}
                </div>
              )}
              
              {/* ServiceNow Link - only for ServiceNow tools */}
              {serviceNowLink && toolCall.status === 'completed' && !toolCall.name.startsWith('web_') && (
                <div className="mt-3 pt-3 border-t border-gray-700/50">
                  <a
                    href={serviceNowLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:text-primary-light text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in ServiceNow
                  </a>
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