import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { program } from "commander";

interface SerpSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  sitelinks?: Array<{
    title: string;
    link: string;
  }>;
}

interface SerpSearchInput {
  query: string;
  maxResults?: number;
}

interface SerpResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    type: string;
  };
  knowledgeGraph?: {
    title: string;
    type: string;
    description: string;
    website?: string;
    attributes?: Record<string, string>;
  };
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
    sitelinks?: Array<{
      title: string;
      link: string;
    }>;
  }>;
  peopleAlsoAsk?: Array<{
    question: string;
    snippet: string;
    title: string;
    link: string;
  }>;
}

export class SerpSearchTool extends Tool<SerpSearchInput, JSONOutput<SerpSearchResult[]>> {
  private readonly apiKey: string;

  constructor() {
    super(
      "SerpSearch",
      "Search the web using Google SERP API with enhanced results including knowledge graph and related questions"
    );

    const apiKey = process.env.SERP_API_KEY;
    if (!apiKey) {
      throw new Error("SERP_API_KEY environment variable is required");
    }
    this.apiKey = apiKey;
  }

  schema(): z.ZodType<SerpSearchInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      maxResults: z
        .number()
        .min(1)
        .max(25)
        .optional()
        .default(10)
        .describe("Maximum number of results to return (1-25)"),
    });
  }

  protected async execute(
    input: SerpSearchInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<SerpSearchResult[]>> {
    try {
      console.log(`Searching SERP for "${input.query}" with max ${input.maxResults} results`);

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: input.query,
          gl: "us",
          hl: "en",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as SerpResponse;
      const searchResults: SerpSearchResult[] = [];

      // Add knowledge graph result if available
      if (data.knowledgeGraph) {
        searchResults.push({
          title: data.knowledgeGraph.title,
          link: data.knowledgeGraph.website || "",
          snippet: data.knowledgeGraph.description,
          position: 0,
        });
      }

      // Add organic search results
      data.organic.forEach((result) => {
        if (searchResults.length < (input.maxResults || 10)) {
          searchResults.push({
            title: result.title,
            link: result.link,
            snippet: result.snippet,
            position: result.position,
            sitelinks: result.sitelinks,
          });
        }
      });

      return new JSONOutput(
        searchResults.slice(0, input.maxResults),
        {
          query: input.query,
          totalResults: searchResults.length,
          hasKnowledgeGraph: !!data.knowledgeGraph,
          peopleAlsoAskCount: data.peopleAlsoAsk?.length || 0,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown search error occurred";
      throw new Error(`SERP search error: ${message}`);
    }
  }
}

async function main() {
  program
    .name("serp-search")
    .description("Search using Google SERP API from the command line")
    .option("-q, --query <string>", "Search query")
    .option("-m, --max-results <number>", "Maximum number of results (1-25)", "5")
    .parse();

  const options = program.opts();

  if (!options.query) {
    console.error("Error: Query is required");
    program.help();
    process.exit(1);
  }

  try {
    const tool = new SerpSearchTool();
    const result = await tool.run({
      query: options.query,
      maxResults: parseInt(options.maxResults, 10),
    });

    const searchResults = JSON.parse(result.getContent());

    // Pretty print results
    console.log("\nSearch Results:\n");
    searchResults.forEach((result: SerpSearchResult, index: number) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   ${result.link}`);
      console.log(`   ${result.snippet}\n`);

      if (result.sitelinks?.length) {
        console.log("   Related links:");
        result.sitelinks.forEach((sitelink) => {
          console.log(`   - ${sitelink.title}: ${sitelink.link}`);
        });
        console.log();
      }
    });

    // Print metadata
    console.log("Metadata:", result.metadata);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 