import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { HeaderGenerator } from "header-generator";
import { program } from "commander";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface DuckDuckGoSearchInput {
  query: string;
  maxResults?: number;
}

interface DuckDuckGoResponse {
  AbstractText: string;
  RelatedTopics: Array<{
    FirstURL?: string;
    Text?: string;
    Topics?: Array<{
      FirstURL: string;
      Text: string;
    }>;
  }>;
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
      
      const headers = new HeaderGenerator().getHeaders();
      
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&pretty=0`,
        {
          headers: {
            'User-Agent': headers['user-agent'],
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as DuckDuckGoResponse;
      const searchResults: SearchResult[] = [];

      for (const topic of data.RelatedTopics) {
        if (topic.FirstURL && topic.Text) {
          searchResults.push({
            title: topic.Text.split(' - ')[0] || topic.Text,
            link: topic.FirstURL,
            snippet: topic.Text
          });
        } else if (topic.Topics) {
          for (const subTopic of topic.Topics) {
            searchResults.push({
              title: subTopic.Text.split(' - ')[0] || subTopic.Text,
              link: subTopic.FirstURL,
              snippet: subTopic.Text
            });
          }
        }

        if (searchResults.length >= (input.maxResults || 10)) {
          break;
        }
      }

      return new JSONOutput(searchResults.slice(0, input.maxResults), {
        query: input.query,
        totalResults: searchResults.length,
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