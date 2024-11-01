import { Tool, StringOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import * as cheerio from "cheerio";
import { program } from 'commander';

interface WebCrawlerInput {
  url: string;
  selector?: string;
  textOnly?: boolean;
  maxLength?: number;
  waitTime?: number;
  removeScripts?: boolean;
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
      waitTime: z.number().optional().default(0).describe("Wait time in milliseconds before extraction"),
      removeScripts: z.boolean().optional().default(false).describe("Remove script and style tags"),
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

async function main() {
  program
    .name('webcrawler')
    .description('Crawl and extract content from web pages')
    .option('-u, --url <string>', 'URL to crawl')
    .option('-s, --selector <string>', 'CSS selector to extract content', 'body')
    .option('-t, --text-only', 'Extract text only (no HTML)', false)
    .option('-m, --max-length <number>', 'Maximum content length', '10000')
    .option('-w, --wait <number>', 'Wait time in milliseconds before extraction', '0')
    .option('-r, --remove-scripts', 'Remove script and style tags', false)
    .parse();

  const options = program.opts();

  if (!options.url) {
    console.error('Error: URL is required');
    program.help();
    process.exit(1);
  }

  try {
    const tool = new WebCrawlerTool();
    const result = await tool.run({
      url: options.url,
      selector: options.selector,
      textOnly: options.textOnly,
      maxLength: parseInt(options.maxLength),
      waitTime: parseInt(options.wait),
      removeScripts: options.removeScripts
    });

    const content = result.getContent();
    
    // Pretty print results
    console.log('\nWeb Crawler Results:\n');
    console.log(`URL: ${options.url}`);
    console.log(`Selector: ${options.selector}`);
    console.log('\nExtracted Content:\n');
    console.log(content);

    // Print metadata
    console.log('\nMetadata:', result.metadata);

    // Print stats
    console.log('\nStats:');
    console.log(`Content Length: ${content.length} characters`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
