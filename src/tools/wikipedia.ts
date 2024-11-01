import wiki from 'wikipedia';
import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import similarity from 'string-similarity';
import TurndownService from 'turndown';
import { program } from 'commander';

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

  protected async execute(
    input: WikipediaInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<WikipediaResult>> {
    // Convert types before validation
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
      extractFormat: typeof input.extractFormat === 'string'
        ? (input.extractFormat.toLowerCase() === 'plain' ? 'plain' : 'markdown')
        : 'markdown'
    };

    try {
      // Set language
      await wiki.setLang(convertedInput.language || 'en');

      // Search for pages and type the results
      const searchResults = await wiki.search(convertedInput.query, {
        limit: 10,
        suggestion: true
      }) as { results: WikiSearchResult[], suggestion: string | boolean };

      if (!searchResults.results?.length) {
        throw new Error(`No Wikipedia results found for: ${convertedInput.query}`);
      }

      // Calculate similarity scores and filter results
      const matchedResults = searchResults.results.map(result => ({
        ...result,
        similarity: similarity.compareTwoStrings(
          convertedInput.query.toLowerCase(),
          result.title.toLowerCase()
        )
      }))
      .filter(result => result.similarity >= (convertedInput.minSimilarity ?? 0.6))
      .sort((a, b) => b.similarity - a.similarity);

      if (!matchedResults.length) {
        throw new Error(`No results met the minimum similarity threshold of ${convertedInput.minSimilarity}`);
      }

      const bestMatch = matchedResults[0];
      const page = await wiki.page(bestMatch.title);
      
      const [intro, categories, images, summary] = await Promise.all([
        page.intro(),
        convertedInput.includeCategories ? page.categories() : Promise.resolve([]),
        convertedInput.includeImages ? page.images() : Promise.resolve([]),
        page.summary()
      ]);

      let extract = intro;
      if (convertedInput.extractFormat === 'markdown') {
        extract = this.turndown.turndown(extract);
      }
      
      if (convertedInput.maxLength && extract.length > convertedInput.maxLength) {
        extract = extract.substring(0, convertedInput.maxLength) + '...';
      }

      const result: WikipediaResult = {
        title: page.title,
        extract,
        pageId: page.pageid,
        url: `https://${convertedInput.language || 'en'}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        similarityScore: bestMatch.similarity,
        summary,
      };

      if (convertedInput.includeCategories) {
        result.categories = categories;
      }

      if (convertedInput.includeImages) {
        result.images = images
          .filter(img => !img.title.toLowerCase().includes('icon'))
          .slice(0, 5)
          .map(img => img.url);
      }

      return new JSONOutput(result, {
        language: convertedInput.language,
        query: convertedInput.query,
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

async function main() {
  program
    .name('wikipedia')
    .description('Search Wikipedia articles from the command line')
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