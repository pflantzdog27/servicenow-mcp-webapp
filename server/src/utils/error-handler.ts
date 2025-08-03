import { createLogger } from './logger';

const logger = createLogger();

export class ServiceNowMCPError extends Error {
  public code: string;
  public details?: any;
  public retryable: boolean;

  constructor(message: string, code: string, details?: any, retryable = false) {
    super(message);
    this.name = 'ServiceNowMCPError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export class ToolExecutionError extends ServiceNowMCPError {
  constructor(toolName: string, originalError: any, retryable = true) {
    const message = `Tool execution failed: ${toolName}`;
    const details = {
      toolName,
      originalError: originalError instanceof Error ? {
        message: originalError.message,
        stack: originalError.stack
      } : originalError
    };
    
    super(message, 'TOOL_EXECUTION_FAILED', details, retryable);
  }
}

export class MCPConnectionError extends ServiceNowMCPError {
  constructor(originalError: any) {
    const message = 'MCP connection failed';
    const details = {
      originalError: originalError instanceof Error ? {
        message: originalError.message,
        stack: originalError.stack
      } : originalError
    };
    
    super(message, 'MCP_CONNECTION_FAILED', details, true);
  }
}

export class ToolApprovalTimeoutError extends ServiceNowMCPError {
  constructor(toolName: string, timeout: number) {
    const message = `Tool approval timeout: ${toolName}`;
    const details = { toolName, timeout };
    
    super(message, 'TOOL_APPROVAL_TIMEOUT', details, false);
  }
}

export class LLMServiceError extends ServiceNowMCPError {
  constructor(provider: string, originalError: any, retryable = true) {
    const message = `LLM service failed: ${provider}`;
    const details = {
      provider,
      originalError: originalError instanceof Error ? {
        message: originalError.message,
        stack: originalError.stack
      } : originalError
    };
    
    super(message, 'LLM_SERVICE_FAILED', details, retryable);
  }
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

export class RetryManager {
  private static defaultOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    retryableErrors: [
      'MCP_CONNECTION_FAILED',
      'TOOL_EXECUTION_FAILED',
      'LLM_SERVICE_FAILED'
    ]
  };

  static async retry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const opts = { ...this.defaultOptions, ...options };
    let lastError: any;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === opts.maxRetries) {
          logger.error('Max retries reached', { error, attempt });
          break;
        }

        // Check if error is retryable
        if (error instanceof ServiceNowMCPError) {
          if (!error.retryable || !opts.retryableErrors?.includes(error.code)) {
            logger.error('Non-retryable error encountered', { error });
            throw error;
          }
        }

        const delay = Math.min(
          opts.baseDelay * Math.pow(opts.backoffFactor, attempt),
          opts.maxDelay
        );

        logger.warn(`Operation failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          error: error instanceof Error ? error.message : error
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

export class ErrorRecoveryManager {
  private failedOperations: Map<string, number> = new Map();
  private circuitBreakerStates: Map<string, {
    failures: number;
    lastFailure: Date;
    state: 'closed' | 'open' | 'half-open';
  }> = new Map();

  recordFailure(operationKey: string): void {
    const current = this.failedOperations.get(operationKey) || 0;
    this.failedOperations.set(operationKey, current + 1);
    
    // Update circuit breaker
    const state = this.circuitBreakerStates.get(operationKey) || {
      failures: 0,
      lastFailure: new Date(),
      state: 'closed'
    };
    
    state.failures++;
    state.lastFailure = new Date();
    
    // Open circuit breaker if too many failures
    if (state.failures >= 5 && state.state === 'closed') {
      state.state = 'open';
      logger.warn(`Circuit breaker opened for ${operationKey}`, { failures: state.failures });
    }
    
    this.circuitBreakerStates.set(operationKey, state);
  }

  recordSuccess(operationKey: string): void {
    this.failedOperations.delete(operationKey);
    
    // Reset circuit breaker
    const state = this.circuitBreakerStates.get(operationKey);
    if (state) {
      state.failures = 0;
      state.state = 'closed';
      this.circuitBreakerStates.set(operationKey, state);
    }
  }

  shouldAttemptOperation(operationKey: string): boolean {
    const state = this.circuitBreakerStates.get(operationKey);
    if (!state || state.state === 'closed') {
      return true;
    }
    
    if (state.state === 'open') {
      // Check if enough time has passed to try half-open
      const timeSinceLastFailure = Date.now() - state.lastFailure.getTime();
      if (timeSinceLastFailure > 30000) { // 30 seconds
        state.state = 'half-open';
        this.circuitBreakerStates.set(operationKey, state);
        return true;
      }
      return false;
    }
    
    // half-open state
    return true;
  }

  getFailureCount(operationKey: string): number {
    return this.failedOperations.get(operationKey) || 0;
  }
}

export function handleError(error: any, context: string): ServiceNowMCPError {
  logger.error(`Error in ${context}:`, error);

  if (error instanceof ServiceNowMCPError) {
    return error;
  }

  // Convert common errors to ServiceNowMCPError
  if (error?.code === 'ECONNREFUSED' || error?.message?.includes('connection')) {
    return new MCPConnectionError(error);
  }

  if (error?.status === 401 || error?.message?.includes('authentication')) {
    return new ServiceNowMCPError(
      'Authentication failed',
      'AUTHENTICATION_FAILED',
      error,
      false
    );
  }

  if (error?.status === 429 || error?.message?.includes('rate limit')) {
    return new ServiceNowMCPError(
      'Rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      error,
      true
    );
  }

  if (error?.status >= 500) {
    return new ServiceNowMCPError(
      'Server error',
      'SERVER_ERROR',
      error,
      true
    );
  }

  // Generic error
  return new ServiceNowMCPError(
    error?.message || 'Unknown error',
    'UNKNOWN_ERROR',
    error,
    false
  );
}

export const globalErrorRecovery = new ErrorRecoveryManager();