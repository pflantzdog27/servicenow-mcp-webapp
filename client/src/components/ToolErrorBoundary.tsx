import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Copy } from 'lucide-react';

interface Props {
  children: ReactNode;
  toolName?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

/**
 * Specialized error boundary for tool invocations and MCP-related components
 * Provides tool-specific error handling with retry capabilities
 */
class ToolErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorId: `tool_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ToolErrorBoundary caught an error in tool component:', error, errorInfo);
    
    this.setState({
      error,
      errorId: `tool_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });

    // Report tool-specific error
    this.reportToolError(error, errorInfo);
  }

  reportToolError = (error: Error, errorInfo: ErrorInfo) => {
    const errorReport = {
      type: 'tool_error',
      toolName: this.props.toolName || 'unknown',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      errorId: this.state.errorId,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        userId: localStorage.getItem('userId') || 'anonymous'
      }
    };

    // Send to error reporting endpoint
    fetch('/api/errors/tool-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorReport)
    }).catch(err => {
      console.error('Failed to report tool error:', err);
    });
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: ''
    });

    // Call parent retry handler if provided
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  copyErrorDetails = () => {
    const errorDetails = {
      errorId: this.state.errorId,
      toolName: this.props.toolName,
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      timestamp: new Date().toISOString()
    };

    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
      .then(() => {
        // Could add a toast notification here
        console.log('Tool error details copied to clipboard');
      })
      .catch(() => {
        console.error('Failed to copy tool error details');
      });
  };

  render() {
    if (this.state.hasError) {
      const { toolName } = this.props;
      const { error, errorId } = this.state;

      return (
        <div 
          className="border border-red-200 rounded-lg bg-red-50 p-4"
          data-testid="tool-error"
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-red-800">
                  Tool Execution Error
                  {toolName && <span className="ml-2 font-mono text-xs">({toolName})</span>}
                </h3>
                <span className="text-xs text-red-600 font-mono">{errorId}</span>
              </div>
              
              <div className="text-sm text-red-700 mb-3">
                <p className="mb-1">
                  The tool component encountered an error and couldn't render properly.
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800">
                    Show error details
                  </summary>
                  <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono">
                    <div className="mb-2">
                      <strong>Message:</strong> {error?.message}
                    </div>
                    {process.env.NODE_ENV === 'development' && error?.stack && (
                      <div>
                        <strong>Stack:</strong>
                        <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={this.handleRetry}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry</span>
                </button>
                
                <button
                  onClick={this.copyErrorDetails}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copy Details</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ToolErrorBoundary;