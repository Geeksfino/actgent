import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WikipediaTool } from '../wikipedia';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WikipediaTool', () => {
  let wikiTool: WikipediaTool;

  beforeEach(() => {
    wikiTool = new WikipediaTool();
    vi.clearAllMocks();
  });

  it('should fetch and parse Wikipedia content correctly', async () => {
    // Mock search response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        query: {
          search: [{
            pageid: 12345,
            title: 'Test Article',
          }],
        },
      }),
    });

    // Mock content response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        query: {
          pages: {
            12345: {
              pageid: 12345,
              title: 'Test Article',
              extract: '<p>Test article content</p>',
              fullurl: 'https://en.wikipedia.org/wiki/Test_Article',
            },
          },
        },
      }),
    });

    const result = await wikiTool.run({
      query: 'test article',
    });

    const content = JSON.parse(result.getContent());
    expect(content).toEqual({
      title: 'Test Article',
      extract: 'Test article content',
      pageId: 12345,
      url: 'https://en.wikipedia.org/wiki/Test_Article',
    });
  });

  it('should handle no search results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        query: {
          search: [],
        },
      }),
    });

    await expect(wikiTool.run({
      query: 'nonexistent article',
    })).rejects.toThrow('Wikipedia error: No Wikipedia results found for: nonexistent article');
  });

  it('should respect maxLength parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        query: {
          search: [{
            pageid: 12345,
            title: 'Test Article',
          }],
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        query: {
          pages: {
            12345: {
              pageid: 12345,
              title: 'Test Article',
              extract: '<p>' + 'a'.repeat(2000) + '</p>',
              fullurl: 'https://en.wikipedia.org/wiki/Test_Article',
            },
          },
        },
      }),
    });

    const result = await wikiTool.run({
      query: 'test article',
      maxLength: 100,
    });

    const content = JSON.parse(result.getContent());
    expect(content.extract.length).toBeLessThanOrEqual(103); // 100 + '...'
    expect(content.extract.endsWith('...')).toBe(true);
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Service Unavailable',
    });

    await expect(wikiTool.run({
      query: 'test article',
    })).rejects.toThrow('Wikipedia error: Wikipedia search failed: Service Unavailable');
  });
}); 