import { Tool, JSONOutput, RunOptions, ToolOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { program } from 'commander';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface GoogleSearchInput {
  query: string;
  maxResults?: number;
  apiKey?: string;
  cx?: string; // Search engine ID
}

export class GoogleSearchTool extends Tool<GoogleSearchInput, JSONOutput<SearchResult[]>, ToolOptions> {
  private readonly defaultApiKey: string;
  private readonly defaultCx: string;

  constructor(apiKey?: string, cx?: string, options?: ToolOptions) {
    super(
      "GoogleSearch",
      "Search the web using Google Custom Search API",
      options
    );
    this.defaultApiKey = apiKey || process.env.GOOGLE_API_KEY || '';
    this.defaultCx = cx || process.env.GOOGLE_SEARCH_CX || '';
  }

  schema(): z.ZodSchema<GoogleSearchInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      maxResults: z.number().min(1).max(10).optional().default(10)
        .describe("Maximum number of results to return (1-10)"),
      apiKey: z.string().optional().describe("Google Custom Search API key"),
      cx: z.string().optional().describe("Google Custom Search engine ID"),
    });
  }

  protected async execute(
    input: GoogleSearchInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SearchResult[]>> {
    const apiKey = input.apiKey || this.defaultApiKey;
    const cx = input.cx || this.defaultCx;
    const maxResults = this.options?.maxRetries || input.maxResults || 10;

    if (!apiKey || !cx) {
      throw new Error('Google API key and Search Engine ID are required');
    }

    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.append('key', apiKey);
      url.searchParams.append('cx', cx);
      url.searchParams.append('q', input.query);
      url.searchParams.append('num', maxResults.toString());

      const response = await fetch(url.toString(), {
        signal: options.signal,
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      const data = await response.json() as { items?: { title: string; link: string; snippet: string }[] };
      const results: SearchResult[] = data.items?.map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      })) || [];

      return new JSONOutput(results, {
        query: input.query,
        totalResults: results.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Google search error: ${error.message}`);
      }
      throw new Error('Unknown search error occurred');
    }
  }
}

async function main() {
  program
    .name('google-search')
    .description('Search Google from the command line')
    .option('-q, --query <string>', 'Search query')
    .option('-m, --max-results <number>', 'Maximum number of results (1-10)', '5')
    .option('-k, --api-key <string>', 'Google Custom Search API key')
    .option('-c, --cx <string>', 'Google Custom Search engine ID')
    .parse();

  const options = program.opts();

  if (!options.query) {
    console.error('Error: Query is required');
    program.help();
    process.exit(1);
  }

  const apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
  const cx = options.cx || process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    console.error('Error: API key and Search Engine ID are required');
    console.error('Set GOOGLE_API_KEY and GOOGLE_SEARCH_CX environment variables or provide via command line options');
    process.exit(1);
  }

  try {
    const tool = new GoogleSearchTool(apiKey, cx);
    const result = await tool.run({
      query: options.query,
      maxResults: parseInt(options.maxResults)
    });

    const searchResults = JSON.parse(result.getContent());
    
    // Pretty print results
    console.log('\nGoogle Search Results:\n');
    searchResults.forEach((result: SearchResult, index: number) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   ${result.link}`);
      console.log(`   ${result.snippet}\n`);
    });

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