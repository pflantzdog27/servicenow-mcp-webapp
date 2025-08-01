import { WebSearchService, WebSearchOptions, WebSearchResponse } from './web-search';
import { WebFetchService, WebFetchOptions, WebContent } from './web-fetch';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface WebToolCall {
  id: string;
  name: 'web_search' | 'web_fetch';
  arguments: Record<string, any>;
}

export interface WebToolResult {
  toolCallId: string;
  result: any;
  isError: boolean;
  content?: {
    type: 'text' | 'json';
    text?: string;
    json?: any;
  }[];
}

export class WebToolsManager {
  private webSearchService: WebSearchService;
  private webFetchService: WebFetchService;

  constructor() {
    this.webSearchService = new WebSearchService();
    this.webFetchService = new WebFetchService();
  }

  async executeTool(toolCall: WebToolCall): Promise<WebToolResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Executing web tool: ${toolCall.name}`, { 
        toolCallId: toolCall.id, 
        arguments: toolCall.arguments 
      });

      let result: any;
      let formattedContent: WebToolResult['content'];

      switch (toolCall.name) {
        case 'web_search':
          result = await this.executeWebSearch(toolCall.arguments);
          formattedContent = this.formatSearchResults(result);
          break;
          
        case 'web_fetch':
          result = await this.executeWebFetch(toolCall.arguments);
          formattedContent = this.formatWebContent(result);
          break;
          
        default:
          throw new Error(`Unknown web tool: ${toolCall.name}`);
      }

      const executionTime = Date.now() - startTime;
      logger.info(`Web tool executed successfully: ${toolCall.name} (${executionTime}ms)`, {
        toolCallId: toolCall.id
      });

      return {
        toolCallId: toolCall.id,
        result,
        isError: false,
        content: formattedContent
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Web tool execution failed: ${toolCall.name} (${executionTime}ms)`, {
        toolCallId: toolCall.id,
        error: errorMessage
      });

      return {
        toolCallId: toolCall.id,
        result: { error: errorMessage },
        isError: true,
        content: [{
          type: 'text',
          text: `Error executing ${toolCall.name}: ${errorMessage}`
        }]
      };
    }
  }

  private async executeWebSearch(args: any): Promise<WebSearchResponse> {
    const options: WebSearchOptions = {
      query: args.query,
      maxResults: args.max_results || 10,
      domain: args.domain,
      dateRange: args.date_range,
      language: args.language || 'en'
    };

    // Add ServiceNow-specific query enhancement
    if (this.isServiceNowQuery(options.query)) {
      options.query = this.enhanceServiceNowQuery(options.query);
    }

    return await this.webSearchService.search(options);
  }

  private async executeWebFetch(args: any): Promise<WebContent> {
    const options: WebFetchOptions = {
      url: args.url,
      maxContentLength: args.max_content_length,
      timeout: args.timeout,
      followRedirects: args.follow_redirects !== false,
      cleanContent: args.clean_content !== false
    };

    // Validate URL
    if (!this.webFetchService.isUrlFetchable(options.url)) {
      throw new Error('URL is not fetchable or is blocked');
    }

    return await this.webFetchService.fetchContent(options);
  }

  private isServiceNowQuery(query: string): boolean {
    const servicenowKeywords = [
      'servicenow', 'snow', 'glide', 'scoped application', 'update set',
      'business rule', 'client script', 'ui policy', 'workflow', 'flow',
      'catalog item', 'record producer', 'incident', 'change', 'problem',
      'script include', 'rest api', 'graphql', 'atf', 'automated test',
      'cmdb', 'discovery', 'orchestration', 'mid server'
    ];

    return servicenowKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private enhanceServiceNowQuery(query: string): string {
    // Add common ServiceNow terms to improve search results
    const enhancements = [];
    
    if (!query.toLowerCase().includes('servicenow')) {
      enhancements.push('ServiceNow');
    }

    if (query.toLowerCase().includes('error') || query.toLowerCase().includes('issue')) {
      enhancements.push('solution');
    }

    return enhancements.length > 0 ? `${query} ${enhancements.join(' ')}` : query;
  }

  private formatSearchResults(searchResponse: WebSearchResponse): WebToolResult['content'] {
    const content: WebToolResult['content'] = [];

    // Summary
    content.push({
      type: 'text',
      text: `Found ${searchResponse.totalResults} results for "${searchResponse.query}" (${searchResponse.searchTime}ms)`
    });

    // Results
    if (searchResponse.results.length > 0) {
      content.push({
        type: 'json',
        json: searchResponse.results
      });

      // Formatted text for each result
      searchResponse.results.forEach((result, index) => {
        content.push({
          type: 'text',
          text: `**${index + 1}. ${result.title}**\n${result.url}\n${result.snippet}\n*Source: ${result.domain}*${result.publishedDate ? ` | Published: ${result.publishedDate}` : ''}\n`
        });
      });
    } else {
      content.push({
        type: 'text',
        text: 'No results found. Try adjusting your search query or search terms.'
      });
    }

    return content;
  }

  private formatWebContent(webContent: WebContent): WebToolResult['content'] {
    const content: WebToolResult['content'] = [];

    // Header with metadata
    content.push({
      type: 'text',
      text: `**${webContent.title}**\n*Source: ${webContent.url}*\n*Content Type: ${webContent.contentType}* | *Reading Time: ${webContent.metadata.readingTime} min* | *Words: ${webContent.metadata.wordCount}*`
    });

    // Breadcrumbs if available
    if (webContent.metadata.breadcrumbs && webContent.metadata.breadcrumbs.length > 0) {
      content.push({
        type: 'text',
        text: `**Navigation:** ${webContent.metadata.breadcrumbs.join(' > ')}`
      });
    }

    // Author and date if available
    const authorDate = [];
    if (webContent.author) authorDate.push(`Author: ${webContent.author}`);
    if (webContent.publishedDate) authorDate.push(`Published: ${webContent.publishedDate}`);
    if (authorDate.length > 0) {
      content.push({
        type: 'text',
        text: authorDate.join(' | ')
      });
    }

    // Main content
    content.push({
      type: 'text',
      text: `**Content:**\n${webContent.content}`
    });

    // Tags if available
    if (webContent.metadata.tags && webContent.metadata.tags.length > 0) {
      content.push({
        type: 'text',
        text: `**Tags:** ${webContent.metadata.tags.join(', ')}`
      });
    }

    // JSON data for structured access
    content.push({
      type: 'json',
      json: webContent
    });

    return content;
  }

  // Get available web tools for MCP integration
  getWebTools() {
    return [
      {
        name: 'web_search',
        description: 'Search the web for information, documentation, solutions, and best practices. Particularly useful for ServiceNow-related queries.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query'
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10, max: 50)',
              default: 10
            },
            domain: {
              type: 'string',
              description: 'Restrict search to specific domain (e.g., docs.servicenow.com)'
            },
            date_range: {
              type: 'string',
              enum: ['day', 'week', 'month', 'year'],
              description: 'Restrict search to content from specific time period'
            },
            language: {
              type: 'string',
              description: 'Language for search results (default: en)',
              default: 'en'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'web_fetch',
        description: 'Fetch and extract content from a specific URL. Useful for retrieving documentation, articles, or specific web pages.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch content from'
            },
            max_content_length: {
              type: 'number',
              description: 'Maximum content length in bytes (default: 50000)',
              default: 50000
            },
            timeout: {
              type: 'number',
              description: 'Request timeout in milliseconds (default: 10000)',
              default: 10000
            },
            follow_redirects: {
              type: 'boolean',
              description: 'Whether to follow redirects (default: true)',
              default: true
            },
            clean_content: {
              type: 'boolean',
              description: 'Whether to clean HTML and extract main content (default: true)',
              default: true
            }
          },
          required: ['url']
        }
      }
    ];
  }
}