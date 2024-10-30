import wiki from 'wikipedia';
import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import similarity from 'string-similarity';
import TurndownService from 'turndown';

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

interface WikipediaInput {
  query: string;
  language?: string;
  maxLength?: number;
  minSimilarity?: number;
  includeCategories?: boolean;
  includeImages?: boolean;
  extractFormat?: 'plain' | 'markdown';
}

export class WikipediaTool extends Tool<WikipediaInput, JSONOutput<WikipediaResult>> {
  private turndown: TurndownService;

  constructor() {
    super("Wikipedia", "Search and retrieve content from Wikipedia");
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
  }

  schema(): z.ZodSchema<WikipediaInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      language: z.string().min(2).max(3).optional().default("en")
        .describe("Wikipedia language code (e.g., 'en', 'es', 'fr')"),
      maxLength: z.number().optional().default(1500)
        .describe("Maximum length of the extract"),
      minSimilarity: z.number().min(0).max(1).optional().default(0.6)
        .describe("Minimum similarity score (0-1) for matching results"),
      includeCategories: z.boolean().optional().default(false)
        .describe("Include page categories in the result"),
      includeImages: z.boolean().optional().default(false)
        .describe("Include page images in the result"),
      extractFormat: z.enum(['plain', 'markdown']).optional().default('markdown')
        .describe("Format of the extracted content"),
    });
  }

  protected async execute(
    input: WikipediaInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<WikipediaResult>> {
    try {
      // Set language
      await wiki.setLang(input.language || 'en');

      // Search for pages
      const searchResults = await wiki.search(input.query, {
        limit: 10,
        suggestion: true
      });

      if (!searchResults.results?.length) {
        throw new Error(`No Wikipedia results found for: ${input.query}`);
      }

      // Calculate similarity scores and filter results
      const matchedResults = searchResults.results.map(result => ({
        ...result,
        similarity: similarity.compareTwoStrings(
          input.query.toLowerCase(),
          result.title.toLowerCase()
        )
      }))
      .filter(result => result.similarity >= (input.minSimilarity ?? 0.6))
      .sort((a, b) => b.similarity - a.similarity);

      if (!matchedResults.length) {
        throw new Error(`No results met the minimum similarity threshold of ${input.minSimilarity}`);
      }

      // Get the best matching page
      const bestMatch = matchedResults[0];
      const page = await wiki.page(bestMatch.title);
      
      // Fetch all required data in parallel
      const [intro, categories, images, summary] = await Promise.all([
        page.intro(),
        input.includeCategories ? page.categories() : Promise.resolve([]),
        input.includeImages ? page.images() : Promise.resolve([]),
        page.summary()
      ]);

      // Process the extract based on format preference
      let extract = intro;
      if (input.extractFormat === 'markdown') {
        extract = this.turndown.turndown(extract);
      }
      
      // Trim content if needed
      if (input.maxLength && extract.length > input.maxLength) {
        extract = extract.substring(0, input.maxLength) + '...';
      }

      const result: WikipediaResult = {
        title: page.title,
        extract,
        pageId: page.pageid,
        url: `https://${input.language || 'en'}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        similarityScore: bestMatch.similarity,
        summary,
      };

      // Add optional data if requested
      if (input.includeCategories) {
        result.categories = categories;
      }

      if (input.includeImages) {
        result.images = images
          .filter(img => !img.title.toLowerCase().includes('icon'))
          .slice(0, 5)
          .map(img => img.url); // Map image objects to their URLs
      }

      return new JSONOutput(result, {
        language: input.language,
        query: input.query,
        similarity: result.similarityScore,
        suggestion: searchResults.suggestion,
      });

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Wikipedia error: ${error.message}`);
      }
      throw new Error('Unknown Wikipedia error occurred');
    }
  }
} 