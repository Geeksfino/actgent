import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import * as cheerio from "cheerio";
import { program } from 'commander';

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

  schema(): z.ZodType<DuckDuckGoSearchInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      maxResults: z
        .union([z.string(), z.number()])
        .transform((val) => (typeof val === "string" ? parseInt(val, 10) : val))
        .refine((val) => typeof val === "number" && val >= 1 && val <= 25, {
          message: "Must be a number between 1 and 25",
        })
        .optional()
        .default(10)
        .describe("Maximum number of results to return (1-25)"),
    }) as z.ZodType<DuckDuckGoSearchInput>;
  }

  protected async execute(
    input: DuckDuckGoSearchInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SearchResult[]>> {
    try {
      console.log(`Searching for ${input.query} with ${input.maxResults} results`);
      
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;

      const response = await fetch(url, {
        signal: options.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DuckDuckGoSearchTool/1.0)',
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

      console.log(results);

      return new JSONOutput(results, {
        query: input.query,
        totalResults: results.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown search error occurred';
      throw new Error(`DuckDuckGo search error: ${message}`);
    }
  }
}

async function main() {
  program
    .name('duckduckgo-search')
    .description('Search DuckDuckGo from the command line')
    .option('-q, --query <string>', 'Search query')
    .option('-m, --max-results <number>', 'Maximum number of results (1-25)', '5')
    .parse();

  const options = program.opts();

  if (!options.query) {
    console.error('Error: Query is required');
    program.help();
    process.exit(1);
  }

  try {
    const tool = new DuckDuckGoSearchTool();
    const result = await tool.run({
      query: options.query,
      maxResults: options.maxResults
    });

    const searchResults = JSON.parse(result.getContent());
    
    // Pretty print results
    console.log('\nSearch Results:\n');
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