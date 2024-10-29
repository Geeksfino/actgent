import { Tool, JSONOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";

interface WikipediaResult {
  title: string;
  extract: string;
  pageId: number;
  url: string;
}

interface WikipediaInput {
  query: string;
  language?: string;
  maxLength?: number;
}

export class WikipediaTool extends Tool<WikipediaInput, JSONOutput<WikipediaResult>> {
  constructor() {
    super(
      "Wikipedia",
      "Search and retrieve content from Wikipedia"
    );
  }

  schema(): z.ZodSchema<WikipediaInput> {
    return z.object({
      query: z.string().min(1).describe("The search query"),
      language: z.string().min(2).max(3).optional().default("en")
        .describe("Wikipedia language code (e.g., 'en', 'es', 'fr')"),
      maxLength: z.number().optional().default(1500)
        .describe("Maximum length of the extract"),
    });
  }

  protected async execute(
    input: WikipediaInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<WikipediaResult>> {
    try {
      // First, search for the page
      const searchUrl = new URL(`https://${input.language}.wikipedia.org/w/api.php`);
      searchUrl.searchParams.append('action', 'query');
      searchUrl.searchParams.append('list', 'search');
      searchUrl.searchParams.append('srsearch', input.query);
      searchUrl.searchParams.append('format', 'json');
      searchUrl.searchParams.append('origin', '*');

      const searchResponse = await fetch(searchUrl.toString(), {
        signal: options.signal,
      });

      if (!searchResponse.ok) {
        throw new Error(`Wikipedia search failed: ${searchResponse.statusText}`);
      }
      const searchData = await searchResponse.json() as { query: { search: { pageid: number }[] } };
      if (!searchData.query?.search?.[0]) {
        throw new Error(`No Wikipedia results found for: ${input.query}`);
      }

      const pageId = searchData.query.search[0].pageid;

      // Then, get the page content
      const contentUrl = new URL(`https://${input.language}.wikipedia.org/w/api.php`);
      contentUrl.searchParams.append('action', 'query');
      contentUrl.searchParams.append('prop', 'extracts|info|titles');
      contentUrl.searchParams.append('exintro', '1');
      contentUrl.searchParams.append('inprop', 'url');
      contentUrl.searchParams.append('format', 'json');
      contentUrl.searchParams.append('pageids', pageId.toString());
      contentUrl.searchParams.append('origin', '*');

      const contentResponse = await fetch(contentUrl.toString(), {
        signal: options.signal,
      });

      if (!contentResponse.ok) {
        throw new Error(`Wikipedia content fetch failed: ${contentResponse.statusText}`);
      }
      const contentData = await contentResponse.json() as { 
        query: { 
          pages: { 
            [key: string]: { 
              extract: string;
              title: string;
              fullurl: string;
            } 
          } 
        } 
      };
      const page = contentData.query.pages[pageId.toString()];

      let extract = page.extract.replace(/<\/?[^>]+(>|$)/g, ''); // Remove HTML tags
      if (input.maxLength && extract.length > input.maxLength) {
        extract = extract.substring(0, input.maxLength) + '...';
      }

      const result: WikipediaResult = {
        title: page.title,
        extract,
        pageId,
        url: page.fullurl,
      };

      return new JSONOutput(result, {
        language: input.language,
        query: input.query,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Wikipedia error: ${error.message}`);
      }
      throw new Error('Unknown Wikipedia error occurred');
    }
  }
} 