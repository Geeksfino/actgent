import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuckDuckGoSearchTool } from '../duckDuckGoSearch';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DuckDuckGoSearchTool', () => {
  let searchTool: DuckDuckGoSearchTool;

  beforeEach(() => {
    searchTool = new DuckDuckGoSearchTool();
    vi.clearAllMocks();
  });

  it('should parse search results correctly', async () => {
    const mockHtml = `
      <div class="result">
        <h2 class="result__title">Test Title 1</h2>
        <a class="result__url" href="https://example1.com">Example 1</a>
        <div class="result__snippet">Test snippet 1</div>
      </div>
      <div class="result">
        <h2 class="result__title">Test Title 2</h2>
        <a class="result__url" href="https://example2.com">Example 2</a>
        <div class="result__snippet">Test snippet 2</div>
      </div>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    });

    const result = await searchTool.run({
      query: 'test query',
      maxResults: 2,
    });

    const results = JSON.parse(result.getContent());
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Test Title 1',
      link: 'https://example1.com',
      snippet: 'Test snippet 1',
    });
  });

  it('should handle empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<div class="no-results">No results found</div>'),
    });

    const result = await searchTool.run({
      query: 'nonexistent query',
    });

    const results = JSON.parse(result.getContent());
    expect(results).toHaveLength(0);
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Service Unavailable',
    });

    await expect(searchTool.run({
      query: 'test query',
    })).rejects.toThrow('DuckDuckGo search error: Search failed: Service Unavailable');
  });
}); 