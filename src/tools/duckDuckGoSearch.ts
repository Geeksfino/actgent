import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import * as cheerio from "cheerio";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface DuckDuckGoSearchInput {
  query: string;
  maxResults?: number;
}

export class DuckDuckGoSearchTool extends Tool<DuckDuckGoSearchInput, JSONOutput<SearchResult[]>> {
  constructor() {
    super(
      "DuckDuckGoSearch",
      "Search the web using DuckDuckGo"
    );
  }

  schema(): z.ZodSchema<DuckDuckGoSearchInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      maxResults: z.number().min(1).max(25).optional().default(10)
        .describe("Maximum number of results to return (1-25)"),
    });
  }

  protected async execute(
    input: DuckDuckGoSearchInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SearchResult[]>> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
      
      const response = await fetch(url, {
        signal: options.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchTool/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      $('.result').slice(0, input.maxResults).each((_, element) => {
        const $element = $(element);
        const title = $element.find('.result__title').text().trim();
        const link = $element.find('.result__url').attr('href') || '';
        const snippet = $element.find('.result__snippet').text().trim();

        if (title && link) {
          results.push({ title, link, snippet });
        }
      });

      return new JSONOutput(results, {
        query: input.query,
        totalResults: results.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`DuckDuckGo search error: ${error.message}`);
      }
      throw new Error('Unknown search error occurred');
    }
  }
} 