import React, { useState, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-json';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  Globe,
  Clock,
  Copy,
  Check,
  Code2,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';

interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
  error?: string;
}

interface EnhancedToolInvocationProps {
  toolCall: ToolCall;
  isCompact?: boolean;
  defaultExpanded?: boolean;
}

const EnhancedToolInvocationWithPrism: React.FC<EnhancedToolInvocationProps> = ({ 
  toolCall, 
  isCompact = false,
  defaultExpanded = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<{
    request: boolean;
    response: boolean;
  }>({
    request: true,
    response: true
  });

  useEffect(() => {
    if (isExpanded) {
      Prism.highlightAll();
    }
  }, [isExpanded, expandedSections]);
  
  const getToolDisplayName = (name: string) => {
    if (name === 'web_search') return 'Web Search';
    if (name === 'web_fetch') return 'Web Fetch';
    
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolIcon = () => {
    const iconClass = "w-4 h-4";
    if (toolCall.name === 'web_search') return <Search className={iconClass} />;
    if (toolCall.name === 'web_fetch') return <Globe className={iconClass} />;
    return <Wrench className={iconClass} />;
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'pending':
        return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
      case 'executing':
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatJson = (data: any, pretty: boolean = true) => {
    if (!data) return '{}';
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      } catch {
        return data;
      }
    }
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  };

  const toggleSection = (section: 'request' | 'response') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getResultPreview = () => {
    if (toolCall.status === 'error') {
      return toolCall.error || 'Error occurred';
    }
    
    if (!toolCall.result) return null;
    
    if (toolCall.name === 'web_search' && toolCall.result?.result?.results) {
      return `Found ${toolCall.result.result.results.length} results`;
    }
    
    if (toolCall.name === 'web_fetch' && toolCall.result?.result?.title) {
      return `Fetched: ${toolCall.result.result.title}`;
    }
    
    if (toolCall.result.content?.[0]?.text) {
      const text = toolCall.result.content[0].text;
      return text.length > 80 ? text.substring(0, 80) + '...' : text;
    }
    
    return 'View details';
  };

  const getToolTypeColor = () => {
    if (toolCall.name.includes('web_')) return 'text-blue-400';
    if (toolCall.name.includes('create') || toolCall.name.includes('update')) return 'text-green-400';
    if (toolCall.name.includes('delete')) return 'text-red-400';
    if (toolCall.name.includes('get') || toolCall.name.includes('list')) return 'text-purple-400';
    return 'text-gray-400';
  };

  if (isCompact) {
    return (
      <div className={clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium",
        "bg-gray-800 border border-gray-700",
        toolCall.status === 'executing' && "border-blue-600/50 bg-blue-900/20",
        toolCall.status === 'completed' && "border-green-600/50 bg-green-900/20",
        toolCall.status === 'error' && "border-red-600/50 bg-red-900/20"
      )}>
        <span className={getToolTypeColor()}>{getToolIcon()}</span>
        <span className="text-gray-300">{getToolDisplayName(toolCall.name)}</span>
        {getStatusIcon()}
      </div>
    );
  }

  return (
    <div 
      className={clsx(
        "my-3 rounded-lg border overflow-hidden transition-all duration-200",
        "bg-gray-900/50 backdrop-blur-sm shadow-lg",
        toolCall.status === 'executing' && "border-blue-600/50 shadow-blue-900/30",
        toolCall.status === 'completed' && "border-gray-700 shadow-gray-900/20",
        toolCall.status === 'error' && "border-red-600/50 shadow-red-900/30",
        toolCall.status === 'pending' && "border-yellow-600/50 shadow-yellow-900/30"
      )}
      data-testid="tool-invocation"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 text-left",
          "hover:bg-gray-800/50",
          isExpanded && "bg-gray-800/30"
        )}
      >
        <ChevronRight className={clsx(
          "w-4 h-4 text-gray-500 transition-transform duration-200",
          isExpanded && "rotate-90"
        )} />
        
        <div className="flex items-center gap-2.5 flex-1">
          <div className={clsx(
            "p-1.5 rounded-md transition-colors duration-200",
            getToolTypeColor(),
            toolCall.status === 'executing' && "bg-blue-900/30 animate-pulse",
            toolCall.status === 'completed' && "bg-gray-800",
            toolCall.status === 'error' && "bg-red-900/30",
            toolCall.status === 'pending' && "bg-yellow-900/30"
          )}>
            {getToolIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-gray-100">
                {getToolDisplayName(toolCall.name)}
              </span>
              {getStatusIcon()}
              {toolCall.executionTime && (
                <span className="text-xs text-gray-500">
                  {(toolCall.executionTime / 1000).toFixed(2)}s
                </span>
              )}
            </div>
            
            {!isExpanded && (
              <div className="text-xs text-gray-400 truncate pr-4">
                {getResultPreview()}
              </div>
            )}
          </div>
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-800">
          {/* Request Section */}
          <div className="border-b border-gray-800">
            <button
              onClick={() => toggleSection('request')}
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/30 transition-colors group"
              data-testid="collapse-toggle"
              aria-expanded={expandedSections.request}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={clsx(
                  "w-3.5 h-3.5 text-gray-500 transition-transform duration-200",
                  !expandedSections.request && "-rotate-90"
                )} />
                <Code2 className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Request
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(formatJson(toolCall.arguments), 'request');
                }}
                className="p-1 rounded hover:bg-gray-700/50 transition-colors opacity-0 group-hover:opacity-100"
                title="Copy request"
              >
                {copiedSection === 'request' ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
            </button>
            
            {expandedSections.request && (
              <div className="px-4 pb-3 animate-in slide-in-from-top-1 duration-200">
                <div className="relative">
                  <pre className="text-xs bg-gray-950 border border-gray-800 rounded-md p-3 overflow-x-auto">
                    <code className="language-json">{formatJson(toolCall.arguments)}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
          
          {/* Response Section */}
          {(toolCall.result || toolCall.error) && (
            <div>
              <button
                onClick={() => toggleSection('response')}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/30 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={clsx(
                    "w-3.5 h-3.5 text-gray-500 transition-transform duration-200",
                    !expandedSections.response && "-rotate-90"
                  )} />
                  {toolCall.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Code2 className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {toolCall.status === 'error' ? 'Error' : 'Response'}
                  </span>
                </div>
                {toolCall.result && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(formatJson(toolCall.result), 'response');
                    }}
                    className="p-1 rounded hover:bg-gray-700/50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Copy response"
                  >
                    {copiedSection === 'response' ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </button>
                )}
              </button>
              
              {expandedSections.response && (
                <div className="px-4 pb-3 animate-in slide-in-from-top-1 duration-200">
                  {toolCall.status === 'error' ? (
                    <div className="text-xs font-mono bg-red-950/50 border border-red-800/50 rounded-md p-3 text-red-200">
                      {toolCall.error || 'Unknown error occurred'}
                    </div>
                  ) : (
                    <RenderToolResult toolCall={toolCall} />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Separate component for rendering tool results
const RenderToolResult: React.FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  if (!toolCall.result) return null;
  
  // Special rendering for web search results
  if (toolCall.name === 'web_search' && toolCall.result?.result?.results) {
    const results = toolCall.result.result.results;
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-400 mb-2">
          {results.length} results • {toolCall.result.result.searchTime}ms
        </div>
        {results.slice(0, 5).map((result: any, idx: number) => (
          <div key={idx} className="bg-gray-950 border border-gray-800 rounded-md p-3 hover:border-gray-700 transition-colors">
            <div className="flex items-start gap-2">
              <div className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded mt-0.5">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <a 
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1 mb-0.5"
                >
                  {result.title}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
                <div className="text-xs text-gray-500">{result.domain}</div>
                <p className="text-xs text-gray-300 mt-1.5 line-clamp-2">{result.snippet}</p>
              </div>
            </div>
          </div>
        ))}
        {results.length > 5 && (
          <div className="text-xs text-gray-500 text-center py-1">
            ...and {results.length - 5} more results
          </div>
        )}
      </div>
    );
  }
  
  // Special rendering for web fetch results
  if (toolCall.name === 'web_fetch' && toolCall.result?.result) {
    const content = toolCall.result.result;
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-md p-3">
        <a 
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-green-400 hover:text-green-300 flex items-center gap-1 mb-1"
        >
          {content.title}
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
        <div className="text-xs text-gray-500 mb-2">
          {content.domain} • {content.contentType} • {content.metadata?.readingTime} min read
        </div>
        {content.metadata?.breadcrumbs && content.metadata.breadcrumbs.length > 0 && (
          <div className="text-xs text-gray-500 mb-2">
            {content.metadata.breadcrumbs.join(' › ')}
          </div>
        )}
        <div className="text-xs text-gray-300 leading-relaxed">
          {content.excerpt}
        </div>
      </div>
    );
  }
  
  // Default JSON rendering
  return (
    <div className="relative">
      <pre className="text-xs bg-gray-950 border border-gray-800 rounded-md p-3 overflow-x-auto">
        <code className="language-json">{formatJson(toolCall.result)}</code>
      </pre>
    </div>
  );
};

const formatJson = (data: any, pretty: boolean = true) => {
  if (!data) return '{}';
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    } catch {
      return data;
    }
  }
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
};

export default EnhancedToolInvocationWithPrism;