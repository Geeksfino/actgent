import { Tool, StringOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import * as cheerio from "cheerio";

interface WebCrawlerInput {
  url: string;
  selector?: string;
  textOnly?: boolean;
  maxLength?: number;
}

export class WebCrawlerTool extends Tool<WebCrawlerInput, StringOutput> {
  constructor() {
    super(
      "WebCrawler",
      "A web crawler tool that fetches and extracts content from web pages"
    );
  }

  schema(): z.ZodSchema<WebCrawlerInput> {
    return z.object({
      url: z.string().url().describe("The URL to crawl"),
      selector: z.string().optional().describe("CSS selector to extract specific content"),
      textOnly: z.boolean().optional().default(true).describe("Extract text content only"),
      maxLength: z.number().optional().default(10000).describe("Maximum length of content to return"),
    });
  }

  protected async execute(
    input: WebCrawlerInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<StringOutput> {
    try {
      const response = await fetch(input.url, {
        signal: options.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CustomWebCrawler/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      let content: string;
      if (input.selector) {
        content = input.textOnly 
          ? $(input.selector).text().trim()
          : $(input.selector).html() || '';
      } else {
        // Remove script and style elements
        $('script').remove();
        $('style').remove();
        content = input.textOnly 
          ? $('body').text().trim()
          : $('body').html() || '';
      }

      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .trim();

      // Truncate if needed
      if (input.maxLength && content.length > input.maxLength) {
        content = content.substring(0, input.maxLength) + '...';
      }

      return new StringOutput(content, {
        url: input.url,
        selector: input.selector,
        contentLength: content.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Web crawling error: ${error.message}`);
      }
      throw new Error('Unknown web crawling error occurred');
    }
  }
}
