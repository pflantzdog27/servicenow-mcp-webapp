import React, { useState, useMemo } from 'react';
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
  Check
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

const EnhancedToolInvocation: React.FC<EnhancedToolInvocationProps> = ({ 
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
  
  const getToolDisplayName = (name: string) => {
    if (name === 'web_search') return 'Web Search';
    if (name === 'web_fetch') return 'Web Fetch';
    
    return name.replace('servicenow-mcp:', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getToolIcon = () => {
    if (toolCall.name === 'web_search') return <Search className="w-4 h-4" />;
    if (toolCall.name === 'web_fetch') return <Globe className="w-4 h-4" />;
    return <Wrench className="w-4 h-4" />;
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
    if (!data) return '';
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

  const syntaxHighlightJson = (json: string) => {
    const highlighted = json
      .replace(/(".*?")\s*:/g, '<span class="text-blue-400">$1</span>:')
      .replace(/:\s*"(.*?)"/g, ': <span class="text-green-400">"$1"</span>')
      .replace(/:\s*(\d+)/g, ': <span class="text-yellow-400">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="text-purple-400">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="text-gray-500">$1</span>');
    
    return <div dangerouslySetInnerHTML={{ __html: highlighted }} />;
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
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }
    
    return 'View details';
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
        {getToolIcon()}
        <span className="text-gray-300">{getToolDisplayName(toolCall.name)}</span>
        {getStatusIcon()}
      </div>
    );
  }

  return (
    <div className={clsx(
      "my-3 rounded-lg border overflow-hidden transition-all duration-200",
      "bg-gray-900/50 backdrop-blur-sm",
      toolCall.status === 'executing' && "border-blue-600/50 shadow-blue-900/20",
      toolCall.status === 'completed' && "border-gray-700",
      toolCall.status === 'error' && "border-red-600/50 shadow-red-900/20",
      toolCall.status === 'pending' && "border-yellow-600/50 shadow-yellow-900/20"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "w-full px-4 py-3 flex items-center gap-3 transition-colors text-left",
          "hover:bg-gray-800/50",
          isExpanded && "bg-gray-800/30"
        )}
      >
        <ChevronRight className={clsx(
          "w-4 h-4 text-gray-500 transition-transform",
          isExpanded && "rotate-90"
        )} />
        
        <div className="flex items-center gap-2.5 flex-1">
          <div className={clsx(
            "p-1.5 rounded-md",
            toolCall.status === 'executing' && "bg-blue-900/30",
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
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={clsx(
                  "w-3.5 h-3.5 text-gray-500 transition-transform",
                  !expandedSections.request && "-rotate-90"
                )} />
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Request
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(formatJson(toolCall.arguments), 'request');
                }}
                className="p-1 rounded hover:bg-gray-700/50 transition-colors"
              >
                {copiedSection === 'request' ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
            </button>
            
            {expandedSections.request && (
              <div className="px-4 pb-3">
                <pre className="text-xs font-mono bg-gray-950 border border-gray-800 rounded-md p-3 overflow-x-auto">
                  {syntaxHighlightJson(formatJson(toolCall.arguments))}
                </pre>
              </div>
            )}
          </div>
          
          {/* Response Section */}
          {(toolCall.result || toolCall.error) && (
            <div>
              <button
                onClick={() => toggleSection('response')}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={clsx(
                    "w-3.5 h-3.5 text-gray-500 transition-transform",
                    !expandedSections.response && "-rotate-90"
                  )} />
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
                    className="p-1 rounded hover:bg-gray-700/50 transition-colors"
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
                <div className="px-4 pb-3">
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
        <div className="text-xs text-gray-400">
          {results.length} results • {toolCall.result.result.searchTime}ms
        </div>
        {results.slice(0, 5).map((result: any, idx: number) => (
          <div key={idx} className="bg-gray-950 border border-gray-800 rounded-md p-3">
            <a 
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              {result.title}
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="text-xs text-gray-500 mt-0.5">{result.domain}</div>
            <p className="text-xs text-gray-300 mt-1.5 line-clamp-2">{result.snippet}</p>
          </div>
        ))}
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
          className="text-sm font-medium text-green-400 hover:text-green-300 flex items-center gap-1"
        >
          {content.title}
          <ExternalLink className="w-3 h-3" />
        </a>
        <div className="text-xs text-gray-500 mt-1">
          {content.domain} • {content.contentType} • {content.metadata?.readingTime} min read
        </div>
        <div className="text-xs text-gray-300 mt-2 leading-relaxed">
          {content.excerpt}
        </div>
      </div>
    );
  }
  
  // Default JSON rendering
  return (
    <pre className="text-xs font-mono bg-gray-950 border border-gray-800 rounded-md p-3 overflow-x-auto">
      <code>{JSON.stringify(toolCall.result, null, 2)}</code>
    </pre>
  );
};

export default EnhancedToolInvocation;