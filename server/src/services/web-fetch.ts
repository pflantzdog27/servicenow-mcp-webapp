import axios from 'axios';
import * as cheerio from 'cheerio';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface WebContent {
  url: string;
  title: string;
  content: string;
  excerpt: string;
  publishedDate?: string;
  author?: string;
  domain: string;
  contentType: 'article' | 'documentation' | 'forum' | 'api-reference' | 'general';
  metadata: {
    wordCount: number;
    readingTime: number;
    lastModified?: string;
    breadcrumbs?: string[];
    tags?: string[];
  };
}

export interface WebFetchOptions {
  url: string;
  maxContentLength?: number;
  timeout?: number;
  followRedirects?: boolean;
  extractImages?: boolean;
  cleanContent?: boolean;
}

export class WebFetchService {
  private readonly userAgent = 'ServiceNow-MCP-Bot/1.0';
  private readonly maxContentLength = 50000; // 50KB default
  private readonly timeout = 10000; // 10 seconds
  private readonly rateLimiter = new Map<string, number[]>();
  private readonly MAX_REQUESTS_PER_DOMAIN_PER_MINUTE = 5;

  private async checkRateLimit(domain: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.rateLimiter.get(domain) || [];
    
    // Remove requests older than 1 minute
    const recentRequests = requests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= this.MAX_REQUESTS_PER_DOMAIN_PER_MINUTE) {
      return false;
    }

    recentRequests.push(now);
    this.rateLimiter.set(domain, recentRequests);
    return true;
  }

  async fetchContent(options: WebFetchOptions): Promise<WebContent> {
    const { url, maxContentLength = this.maxContentLength, timeout = this.timeout } = options;
    
    try {
      // Validate URL
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Check rate limit
      if (!(await this.checkRateLimit(domain))) {
        throw new Error(`Rate limit exceeded for domain: ${domain}`);
      }

      logger.info(`Fetching content from: ${url}`);

      // Make HTTP request
      const response = await axios.get(url, {
        timeout,
        maxContentLength,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        maxRedirects: options.followRedirects ? 5 : 0
      });

      // Parse HTML content
      const $ = cheerio.load(response.data);
      
      // Extract metadata
      const title = this.extractTitle($);
      const content = this.extractMainContent($, options.cleanContent !== false);
      const excerpt = this.generateExcerpt(content);
      const publishedDate = this.extractPublishedDate($);
      const author = this.extractAuthor($);
      const contentType = this.detectContentType(url, $);
      const breadcrumbs = this.extractBreadcrumbs($);
      const tags = this.extractTags($);
      const lastModified = response.headers['last-modified'];

      const wordCount = content.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200); // Average reading speed

      const webContent: WebContent = {
        url,
        title,
        content,
        excerpt,
        publishedDate,
        author,
        domain,
        contentType,
        metadata: {
          wordCount,
          readingTime,
          lastModified,
          breadcrumbs,
          tags
        }
      };

      logger.info(`Successfully fetched content from ${url} (${wordCount} words, ${readingTime}min read)`);
      return webContent;

    } catch (error) {
      logger.error(`Failed to fetch content from ${url}:`, error);
      throw new Error(`Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors for title
    const titleSelectors = [
      'h1',
      'title',
      '.page-title',
      '.article-title',
      '[data-testid="title"]',
      '.entry-title'
    ];

    for (const selector of titleSelectors) {
      const title = $(selector).first().text().trim();
      if (title) return title;
    }

    return 'Untitled Page';
  }

  private extractMainContent($: cheerio.CheerioAPI, cleanContent: boolean): string {
    // Remove unwanted elements
    if (cleanContent) {
      $('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar').remove();
    }

    // Try to find main content area
    const contentSelectors = [
      'main',
      '.main-content',
      '.content',
      '.article-content',
      '.post-content',
      '.entry-content',
      '[role="main"]',
      '.documentation-content',
      '.wiki-content'
    ];

    for (const selector of contentSelectors) {
      const content = $(selector).first().text().trim();
      if (content && content.length > 100) {
        return this.cleanText(content);
      }
    }

    // Fallback to body content
    $('script, style, nav, header, footer').remove();
    const bodyContent = $('body').text().trim();
    return this.cleanText(bodyContent);
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n\n') // Preserve paragraph breaks
      .trim();
  }

  private generateExcerpt(content: string, maxLength: number = 300): string {
    if (content.length <= maxLength) return content;
    
    const excerpt = content.substring(0, maxLength);
    const lastSpace = excerpt.lastIndexOf(' ');
    
    return lastSpace > maxLength * 0.8 
      ? excerpt.substring(0, lastSpace) + '...'
      : excerpt + '...';
  }

  private extractPublishedDate($: cheerio.CheerioAPI): string | undefined {
    const dateSelectors = [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="publish-date"]',
      '[datetime]',
      '.published-date',
      '.date-published'
    ];

    for (const selector of dateSelectors) {
      const date = $(selector).attr('content') || $(selector).attr('datetime') || $(selector).text();
      if (date) return date.trim();
    }

    return undefined;
  }

  private extractAuthor($: cheerio.CheerioAPI): string | undefined {
    const authorSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      '.author',
      '.byline',
      '[rel="author"]'
    ];

    for (const selector of authorSelectors) {
      const author = $(selector).attr('content') || $(selector).text();
      if (author) return author.trim();
    }

    return undefined;
  }

  private detectContentType(url: string, $: cheerio.CheerioAPI): WebContent['contentType'] {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('docs.servicenow.com') || 
        urlLower.includes('developer.servicenow.com') ||
        urlLower.includes('/api/') ||
        urlLower.includes('/reference/')) {
      return urlLower.includes('/api/') ? 'api-reference' : 'documentation';
    }
    
    if (urlLower.includes('community.servicenow.com') ||
        urlLower.includes('/forum/') ||
        urlLower.includes('/discussion/')) {
      return 'forum';
    }

    // Check for article indicators
    const articleIndicators = $('article, .article, [role="article"]');
    if (articleIndicators.length > 0) {
      return 'article';
    }

    return 'general';
  }

  private extractBreadcrumbs($: cheerio.CheerioAPI): string[] {
    const breadcrumbSelectors = [
      '.breadcrumb a',
      '.breadcrumbs a',
      '[data-testid="breadcrumb"] a',
      'nav[aria-label="breadcrumb"] a'
    ];

    for (const selector of breadcrumbSelectors) {
      const breadcrumbs = $(selector).map((_, el) => $(el).text().trim()).get();
      if (breadcrumbs.length > 0) return breadcrumbs;
    }

    return [];
  }

  private extractTags($: cheerio.CheerioAPI): string[] {
    const tagSelectors = [
      'meta[name="keywords"]',
      '.tags a',
      '.tag',
      '[data-testid="tags"] a'
    ];

    const tags: string[] = [];

    for (const selector of tagSelectors) {
      if (selector.startsWith('meta')) {
        const keywords = $(selector).attr('content');
        if (keywords) {
          tags.push(...keywords.split(',').map(tag => tag.trim()));
        }
      } else {
        $(selector).each((_, el) => {
          const tag = $(el).text().trim();
          if (tag) tags.push(tag);
        });
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  // Utility method to check if URL is fetchable
  isUrlFetchable(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const allowedProtocols = ['http:', 'https:'];
      const blockedDomains = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        'internal',
        'private'
      ];

      if (!allowedProtocols.includes(urlObj.protocol)) {
        return false;
      }

      if (blockedDomains.some(domain => urlObj.hostname.includes(domain))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}