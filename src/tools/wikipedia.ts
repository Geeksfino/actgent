import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import similarity from 'string-similarity';
import TurndownService from 'turndown';
import { program } from 'commander';
import { ProxyAgent } from 'proxy-agent';

interface WikipediaResult {
  title: string;
  extract: string;
  pageId: number;
  url: string;
  categories?: string[];
  images?: string[];
  similarityScore?: number;
  summary?: {
    extract: string;
    thumbnail?: {
      source: string;
      width: number;
      height: number;
    };
  };
}

interface WikiSearchResult {
  title: string;
  pageid: number;
  size: number;
  wordcount: number;
  snippet: string;
  timestamp: string;
}

interface WikipediaInput {
  query: string;
  language?: string;
  maxLength?: number | string;
  minSimilarity?: number | string;
  includeCategories?: boolean | string;
  includeImages?: boolean | string;
  extractFormat?: 'plain' | 'markdown' | string;
}

interface WikiSearchResponse {
  query?: {
    search?: Array<{
      title: string;
      pageid: number;
      size: number;
      wordcount: number;
      snippet: string;
      timestamp: string;
    }>;
  };
}

interface WikiPageResponse {
  query: {
    pages: {
      [key: string]: {
        title: string;
        extract: string;
        fullurl: string;
        categories?: Array<{ title: string }>;
        images?: Array<{ title: string; url?: string }>;
      };
    };
  };
}

export class WikipediaTool extends Tool<WikipediaInput, JSONOutput<WikipediaResult>> {
  private turndown: TurndownService;
  private proxyAgent: ProxyAgent | undefined;

  constructor() {
    super("Wikipedia", "Search and retrieve content from Wikipedia");
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });

    // Check for both HTTP and SOCKS proxies
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const socksProxy = process.env.SOCKS_PROXY || process.env.socks_proxy;
    if (httpProxy || socksProxy) {
      // proxy-agent will automatically pick the right protocol
      this.proxyAgent = new ProxyAgent();
    }
  }

  schema(): z.ZodSchema<WikipediaInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      language: z.string().min(2).max(3).optional().default("en")
        .describe("Wikipedia language code (e.g., 'en', 'es', 'fr')"),
      maxLength: z.union([z.string(), z.number()]).optional().default(1500)
        .transform(val => typeof val === 'string' ? parseInt(val, 10) : val)
        .describe("Maximum length of the extract"),
      minSimilarity: z.union([z.string(), z.number()]).optional().default(0.6)
        .transform(val => typeof val === 'string' ? parseFloat(val) : val)
        .describe("Minimum similarity score (0-1)"),
      includeCategories: z.union([z.string(), z.boolean()]).optional().default(false)
        .transform(val => typeof val === 'string' ? val.toLowerCase() === 'true' : val)
        .describe("Include page categories in the result"),
      includeImages: z.union([z.string(), z.boolean()]).optional().default(false)
        .transform(val => typeof val === 'string' ? val.toLowerCase() === 'true' : val)
        .describe("Include page images in the result"),
      extractFormat: z.enum(['plain', 'markdown', 'plain text']).optional().default('markdown')
        .transform(val => val === 'plain text' ? 'plain' : val)
        .describe("Format of the extracted content"),
    });
  }

  private async fetchWithRetry(url: string, retries = 3, timeout = 5000): Promise<Response> {
    let lastError = new Error('Failed to fetch');

    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const fetchOptions: RequestInit = { 
          signal: controller.signal,
          headers: { 'User-Agent': 'ActGent/1.0' }
        };

        // Only add dispatcher if proxy is configured
        if (this.proxyAgent) {
          (fetchOptions as any).dispatcher = this.proxyAgent;  // Type assertion to avoid TS error
          // Alternative: fetchOptions.dispatcher = this.proxyAgent as unknown as Dispatcher
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
      } catch (error) {
        console.warn(`Attempt ${i + 1} failed:`, error);
        lastError = error as Error;
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    throw new Error(`Failed to connect to Wikipedia API after ${retries} attempts: ${lastError.message}`);
  }

  private async searchWikipedia(query: string, language: string): Promise<WikiSearchResponse> {
    const searchUrl = `https://${language}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      origin: '*',
      srlimit: '10',
      srprop: 'snippet|titlesnippet|size|wordcount|timestamp'
    });

    const response = await this.fetchWithRetry(searchUrl);
    return response.json() as Promise<WikiSearchResponse>;
  }

  private async getPageContent(pageId: number, language: string): Promise<WikiPageResponse> {
    const contentUrl = `https://${language}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      prop: 'extracts|categories|images|info',
      exintro: '1',
      inprop: 'url',
      format: 'json',
      pageids: pageId.toString(),
      origin: '*',
      explaintext: '1'
    });

    const response = await this.fetchWithRetry(contentUrl);
    return response.json() as Promise<WikiPageResponse>;
  }

  protected async execute(
    input: WikipediaInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<WikipediaResult>> {
    try {
      console.log(`Wikipedia Tool Configuration:
        Query: ${input.query}
        Language: ${input.language || 'en'}
        Max Length: ${input.maxLength || 1500}
        Min Similarity: ${input.minSimilarity || 0.6}
      `);
      
      const convertedInput = {
        ...input,
        maxLength: typeof input.maxLength === 'string' ? parseInt(input.maxLength, 10) : input.maxLength,
        minSimilarity: typeof input.minSimilarity === 'string' ? parseFloat(input.minSimilarity) : input.minSimilarity,
        includeCategories: typeof input.includeCategories === 'string' 
          ? String(input.includeCategories).toLowerCase() === 'true' 
          : Boolean(input.includeCategories),
        includeImages: typeof input.includeImages === 'string' 
          ? String(input.includeImages).toLowerCase() === 'true' 
          : Boolean(input.includeImages),
        language: input.language || 'en'
      };

      console.log('Searching Wikipedia for:', convertedInput.query);
      const searchData = await this.searchWikipedia(convertedInput.query, convertedInput.language);
      
      if (!searchData.query?.search?.length) {
        throw new Error(`No Wikipedia results found for: ${convertedInput.query}`);
      }

      // Calculate similarity scores with more lenient matching
      const matchedResults = searchData.query.search
        .map(result => ({
          ...result,
          similarity: Math.max(
            similarity.compareTwoStrings(
              convertedInput.query.toLowerCase(),
              result.title.toLowerCase()
            ),
            // Also check partial matches
            similarity.compareTwoStrings(
              convertedInput.query.toLowerCase().split(',')[0].trim(),
              result.title.toLowerCase()
            )
          )
        }))
        .filter((result) => result.similarity >= (convertedInput.minSimilarity ?? 0.3))  // Lower default threshold
        .sort((a, b) => b.similarity - a.similarity);

      if (!matchedResults.length) {
        // If no results with similarity threshold, return best match anyway
        const bestMatch = searchData.query.search[0];
        if (bestMatch) {
          matchedResults.push({
            ...bestMatch,
            similarity: 0
          });
        } else {
          throw new Error(`No Wikipedia results found for: ${convertedInput.query}`);
        }
      }

      const bestMatch = matchedResults[0];
      const pageData = await this.getPageContent(bestMatch.pageid, convertedInput.language);
      const page = Object.values(pageData.query.pages)[0];

      let extract = page.extract;
      if (convertedInput.extractFormat === 'markdown') {
        extract = this.turndown.turndown(extract);
      }

      const result: WikipediaResult = {
        title: page.title,
        extract: extract.substring(0, convertedInput.maxLength || 1500) + '...',
        pageId: bestMatch.pageid,
        url: page.fullurl || `https://${convertedInput.language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        similarityScore: bestMatch.similarity,
      };

      if (convertedInput.includeCategories && page.categories) {
        result.categories = page.categories.map((cat: any) => cat.title);
      }

      if (convertedInput.includeImages && page.images) {
        result.images = page.images
          .filter((img: any) => !img.title.toLowerCase().includes('icon'))
          .slice(0, 5)
          .map((img: any) => img.url);
      }

      return new JSONOutput(result, {
        language: convertedInput.language,
        query: convertedInput.query,
        similarity: result.similarityScore,
      });

    } catch (error) {
      console.error('Wikipedia Tool Error:', error);
      if (error instanceof Error) {
        throw new Error(`Wikipedia error: ${error.message}`);
      }
      throw new Error('An unexpected error occurred while accessing Wikipedia');
    }
  }
}

async function main() {
  program
    .name('wikipedia')
    .description(`Search Wikipedia articles from the command line. 
      Set HTTP_PROXY, HTTPS_PROXY or SOCKS_PROXY environment variables to use a proxy.
      Use --min-similarity to set the minimum similarity score (0-1) for the search results.`)
    .option('-q, --query <string>', 'Search query')
    .option('-l, --language <string>', 'Language code (e.g., en, es, fr)', 'en')
    .option('-m, --max-length <number>', 'Maximum length of extract', '1500')
    .option('-s, --min-similarity <number>', 'Minimum similarity score (0-1)', '0.6')
    .option('-c, --categories', 'Include categories')
    .option('-i, --images', 'Include images')
    .option('-f, --format <string>', 'Extract format (plain or markdown)', 'markdown')
    .parse();

  const options = program.opts();

  if (!options.query) {
    console.error('Error: Query is required');
    program.help();
    process.exit(1);
  }

  try {
    const tool = new WikipediaTool();
    const result = await tool.run({
      query: options.query,
      language: options.language,
      maxLength: parseInt(options.maxLength),
      minSimilarity: parseFloat(options.minSimilarity),
      includeCategories: options.categories,
      includeImages: options.images,
      extractFormat: options.format
    });

    const article = JSON.parse(result.getContent());
    
    // Pretty print results
    console.log('\nWikipedia Article:\n');
    console.log(`Title: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`\nExtract:\n${article.extract}\n`);

    if (article.categories) {
      console.log('Categories:', article.categories.join(', '), '\n');
    }

    if (article.images) {
      console.log('Images:', article.images.join('\n'), '\n');
    }

    // Print metadata
    console.log('Metadata:', result.metadata);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}