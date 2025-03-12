import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleSearchTool } from '../googleSearch';
import { createMockFetch } from './testUtils';

const mockFetch = createMockFetch();
global.fetch = mockFetch;

describe('GoogleSearchTool', () => {
  let searchTool: GoogleSearchTool;

  beforeEach(() => {
    searchTool = new GoogleSearchTool('test-api-key', 'test-cx');
    vi.clearAllMocks();
  });

  it('should parse search results correctly', async () => {
    const mockResponse = {
      items: [
        {
          title: 'Test Title 1',
          link: 'https://example1.com',
          snippet: 'Test snippet 1',
        },
        {
          title: 'Test Title 2',
          link: 'https://example2.com',
          snippet: 'Test snippet 2',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
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
      json: () => Promise.resolve({}),
    });

    const result = await searchTool.run({
      query: 'nonexistent query',
    });

    const results = JSON.parse(result.getContent());
    expect(results).toHaveLength(0);
  });

  it('should require API credentials', async () => {
    const toolWithoutCreds = new GoogleSearchTool();
    await expect(toolWithoutCreds.run({
      query: 'test query',
    })).rejects.toThrow('Google API key and Search Engine ID are required');
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Service Unavailable',
    });

    await expect(searchTool.run({
      query: 'test query',
    })).rejects.toThrow('Google search error: Search failed: Service Unavailable');
  });
}); 