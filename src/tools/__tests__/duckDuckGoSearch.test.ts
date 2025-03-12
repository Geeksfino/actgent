import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DuckDuckGoSearchTool } from '../duckDuckGoSearch';
import { createMockFetch } from './testUtils';

const mockFetch = createMockFetch();
global.fetch = mockFetch;

describe('DuckDuckGoSearchTool', () => {
  let searchTool: DuckDuckGoSearchTool;

  beforeEach(() => {
    searchTool = new DuckDuckGoSearchTool();
    vi.clearAllMocks();
  });

  it('should parse search results correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        RelatedTopics: [
          {
            Text: 'Test snippet 1',
            FirstURL: 'https://example1.com',
            Result: '<a href="https://example1.com">Test snippet 1</a> - Test snippet 1'
          },
          {
            Text: 'Test snippet 2',
            FirstURL: 'https://example2.com',
            Result: '<a href="https://example2.com">Test snippet 2</a> - Test snippet 2'
          }
        ]
      })
    });

    const result = await searchTool.run({
      query: 'test query',
      maxResults: 2,
    });

    const results = JSON.parse(result.getContent());
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Test snippet 1',
      link: 'https://example1.com',
      snippet: 'Test snippet 1',
    });
  });

  it('should handle empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        RelatedTopics: []
      })
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
      status: 503,
      statusText: 'Service Unavailable'
    });

    await expect(searchTool.run({
      query: 'test query',
    })).rejects.toThrow('DuckDuckGo search error: HTTP error! status: 503');
  });
}); 