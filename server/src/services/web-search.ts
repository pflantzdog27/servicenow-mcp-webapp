import axios from 'axios';
import * as cheerio from 'cheerio';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  publishedDate?: string;
}

export interface WebSearchOptions {
  query: string;
  maxResults?: number;
  domain?: string;
  dateRange?: 'day' | 'week' | 'month' | 'year';
  language?: string;
}

export interface WebSearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
  searchTime: number;
}

export class WebSearchService {
  private readonly searchEngines: SearchEngine[] = [];
  private currentEngineIndex = 0;
  private readonly rateLimiter = new Map<string, number[]>();
  private readonly MAX_REQUESTS_PER_MINUTE = 10;

  constructor() {
    this.initializeSearchEngines();
  }

  private initializeSearchEngines() {
    // Google Custom Search (if API key available)
    if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
      this.searchEngines.push(new GoogleSearchEngine(
        process.env.GOOGLE_SEARCH_API_KEY,
        process.env.GOOGLE_SEARCH_CX
      ));
    }

    // Bing Search (if API key available)
    if (process.env.BING_SEARCH_API_KEY) {
      this.searchEngines.push(new BingSearchEngine(process.env.BING_SEARCH_API_KEY));
    }

    // DuckDuckGo (no API key required)
    this.searchEngines.push(new DuckDuckGoSearchEngine());

    logger.info(`Initialized ${this.searchEngines.length} search engines`);
  }

  private async checkRateLimit(engineName: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.rateLimiter.get(engineName) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimiter.set(engineName, recentRequests);
    return true;
  }

  async search(options: WebSearchOptions): Promise<WebSearchResponse> {
    const startTime = Date.now();
    
    if (this.searchEngines.length === 0) {
      throw new Error('No search engines available. Please configure API keys.');
    }

    let lastError: Error | null = null;
    
    // Try each search engine until one succeeds
    for (let i = 0; i < this.searchEngines.length; i++) {
      const engine = this.searchEngines[this.currentEngineIndex];
      
      try {
        // Check rate limit
        if (!(await this.checkRateLimit(engine.name))) {
          logger.warn(`Rate limit exceeded for ${engine.name}, trying next engine`);
          this.currentEngineIndex = (this.currentEngineIndex + 1) % this.searchEngines.length;
          continue;
        }

        const results = await engine.search(options);
        const searchTime = Date.now() - startTime;

        // Filter and enhance results for ServiceNow context
        const enhancedResults = this.enhanceResultsForServiceNow(results);

        logger.info(`Web search completed: "${options.query}" using ${engine.name} (${enhancedResults.length} results, ${searchTime}ms)`);

        return {
          results: enhancedResults,
          query: options.query,
          totalResults: enhancedResults.length,
          searchTime
        };

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Search failed with ${engine.name}: ${error}`);
        this.currentEngineIndex = (this.currentEngineIndex + 1) % this.searchEngines.length;
      }
    }

    throw new Error(`All search engines failed. Last error: ${lastError?.message}`);
  }

  private enhanceResultsForServiceNow(results: SearchResult[]): SearchResult[] {
    // Prioritize ServiceNow-related domains
    const servicenowDomains = [
      'docs.servicenow.com',
      'developer.servicenow.com',
      'community.servicenow.com',
      'support.servicenow.com',
      'store.servicenow.com'
    ];

    return results
      .map(result => ({
        ...result,
        // Add relevance scoring for ServiceNow domains
        isServiceNowOfficial: servicenowDomains.some(domain => result.url.includes(domain))
      }))
      .sort((a, b) => {
        // Prioritize official ServiceNow content
        if (a.isServiceNowOfficial && !b.isServiceNowOfficial) return -1;
        if (!a.isServiceNowOfficial && b.isServiceNowOfficial) return 1;
        return 0;
      })
      .map(({ isServiceNowOfficial, ...result }) => result);
  }
}

// Abstract base class for search engines
abstract class SearchEngine {
  abstract readonly name: string;
  abstract search(options: WebSearchOptions): Promise<SearchResult[]>;
}

class GoogleSearchEngine extends SearchEngine {
  readonly name = 'Google';
  
  constructor(
    private apiKey: string,
    private searchEngineId: string
  ) {
    super();
  }

  async search(options: WebSearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: options.query,
      num: Math.min(options.maxResults || 10, 10).toString()
    });

    if (options.domain) {
      params.set('siteSearch', options.domain);
    }

    if (options.dateRange) {
      params.set('dateRestrict', options.dateRange);
    }

    const response = await axios.get(`https://www.googleapis.com/customsearch/v1?${params}`);
    
    return (response.data.items || []).map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      domain: new URL(item.link).hostname,
      publishedDate: item.pagemap?.metatags?.[0]?.['article:published_time']
    }));
  }
}

class BingSearchEngine extends SearchEngine {
  readonly name = 'Bing';
  
  constructor(private apiKey: string) {
    super();
  }

  async search(options: WebSearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      count: Math.min(options.maxResults || 10, 50).toString(),
      mkt: options.language || 'en-US'
    });

    if (options.domain) {
      params.set('q', `${options.query} site:${options.domain}`);
    }

    const response = await axios.get(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey
      }
    });

    return (response.data.webPages?.value || []).map((item: any) => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet,
      domain: new URL(item.url).hostname,
      publishedDate: item.datePublished
    }));
  }
}

class DuckDuckGoSearchEngine extends SearchEngine {
  readonly name = 'DuckDuckGo';

  async search(options: WebSearchOptions): Promise<SearchResult[]> {
    try {
      // Use DuckDuckGo's instant answer API (limited but free)
      const query = options.domain ? `${options.query} site:${options.domain}` : options.query;
      
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1'
        },
        timeout: 5000
      });

      const results: SearchResult[] = [];
      
      // Add the main result if available
      if (response.data.Answer) {
        results.push({
          title: 'DuckDuckGo Instant Answer',
          url: response.data.AbstractURL || 'https://duckduckgo.com',
          snippet: response.data.Answer,
          domain: 'duckduckgo.com'
        });
      }

      // Add related topics
      if (response.data.RelatedTopics) {
        response.data.RelatedTopics.slice(0, options.maxResults || 5).forEach((topic: any) => {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Topic',
              url: topic.FirstURL,
              snippet: topic.Text,
              domain: new URL(topic.FirstURL).hostname
            });
          }
        });
      }

      return results;
    } catch (error) {
      logger.warn('DuckDuckGo search failed, returning empty results:', error);
      return [];
    }
  }
}