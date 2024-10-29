import { Tool, JSONOutput, RunOptions, ToolOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";

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