import { Tool, JSONOutput, RunOptions, ToolOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { program } from 'commander';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface BingSearchInput {
  query: string;
  maxResults?: number;
  apiKey?: string;
}

export class BingSearchTool extends Tool<BingSearchInput, JSONOutput<SearchResult[]>, ToolOptions> {
  private readonly defaultApiKey: string;

  constructor(apiKey?: string, options?: ToolOptions) {
    super(
      "BingSearch",
      "Search the web using Bing Web Search API",
      options
    );
    this.defaultApiKey = apiKey || process.env.BING_API_KEY || '';
  }

  schema(): z.ZodSchema<BingSearchInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      maxResults: z.number().min(1).max(50).optional().default(10)
        .describe("Maximum number of results to return (1-50)"),
      apiKey: z.string().optional().describe("Bing Web Search API key"),
    });
  }

  protected async execute(
    input: BingSearchInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SearchResult[]>> {
    const apiKey = input.apiKey || this.defaultApiKey;
    const maxResults = input.maxResults || 10;

    if (!apiKey) {
      throw new Error('Bing API key is required');
    }

    try {
      const response = await fetch(
        `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(input.query)}&count=${maxResults}`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Accept': 'application/json',
          },
          signal: options.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json() as {
        webPages?: {
          value: Array<{
            name: string;
            url: string;
            snippet: string;
          }>;
        };
      };

      const results: SearchResult[] = data.webPages?.value.map((item) => ({
        title: item.name,
        link: item.url,
        snippet: item.snippet,
      })) || [];

      return new JSONOutput(results, {
        query: input.query,
        totalResults: results.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bing search error: ${error.message}`);
      }
      throw new Error('Unknown search error occurred');
    }
  }
}

async function main() {
  program
    .name('bing-search')
    .description('Search Bing from the command line')
    .option('-q, --query <string>', 'Search query')
    .option('-m, --max-results <number>', 'Maximum number of results (1-50)', '5')
    .option('-k, --api-key <string>', 'Bing Web Search API key')
    .parse();

  const options = program.opts();

  if (!options.query) {
    console.error('Error: Query is required');
    program.help();
    process.exit(1);
  }

  const apiKey = options.apiKey || process.env.BING_API_KEY;

  if (!apiKey) {
    console.error('Error: API key is required');
    console.error('Set BING_API_KEY environment variable or provide via command line option');
    process.exit(1);
  }

  try {
    const tool = new BingSearchTool(apiKey);
    const result = await tool.run({
      query: options.query,
      maxResults: parseInt(options.maxResults)
    });

    const searchResults = JSON.parse(result.getContent());
    
    // Pretty print results
    console.log('\nBing Search Results:\n');
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