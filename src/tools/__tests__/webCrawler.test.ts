import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebCrawlerTool } from '../webCrawler';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebCrawlerTool', () => {
  let webCrawler: WebCrawlerTool;

  beforeEach(() => {
    webCrawler = new WebCrawlerTool();
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should fetch and extract content from a webpage', async () => {
      const mockHtml = `
        <html>
          <body>
            <div class="content">
              <h1>Test Title</h1>
              <p>Test paragraph content</p>
            </div>
            <script>console.log('test');</script>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await webCrawler.run({
        url: 'https://example.com',
        textOnly: true,
      });

      expect(result.getContent()).toContain('Test Title');
      expect(result.getContent()).toContain('Test paragraph content');
      expect(result.getContent()).not.toContain('console.log');
    });

    it('should extract content using a specific selector', async () => {
      const mockHtml = `
        <html>
          <body>
            <div class="content">
              <h1>Test Title</h1>
              <p>Test paragraph content</p>
            </div>
            <div class="other">Other content</div>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await webCrawler.run({
        url: 'https://example.com',
        selector: '.content',
        textOnly: true,
      });

      expect(result.getContent()).toContain('Test Title');
      expect(result.getContent()).not.toContain('Other content');
    });

    it('should respect maxLength parameter', async () => {
      const mockHtml = `
        <html>
          <body>
            <div>${'a'.repeat(1000)}</div>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml),
      });

      const result = await webCrawler.run({
        url: 'https://example.com',
        maxLength: 100,
      });

      expect(result.getContent().length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.getContent()).toContain('...');   
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(webCrawler.run({
        url: 'https://example.com',
      })).rejects.toThrow('Web crawling error: Network error');
    });

    it('should handle non-200 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(webCrawler.run({
        url: 'https://example.com',
      })).rejects.toThrow('Web crawling error: Failed to fetch URL: Not Found');
    });

    it('should validate input URL', async () => {
      await expect(webCrawler.run({
        url: 'invalid-url',
      })).rejects.toThrow();
    });
  });
}); 