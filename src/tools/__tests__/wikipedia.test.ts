/// <reference types="vitest" />
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { WikipediaTool } from '../wikipedia';
import wiki from 'wikipedia';
import { Page } from 'wikipedia/dist/page';

describe('WikipediaTool', () => {
  let wikiTool: WikipediaTool;

  beforeEach(() => {
    wikiTool = new WikipediaTool();
    vi.clearAllMocks();

    // Mock fetch globally with proper search results structure
    const mockFetch = vi.fn();
    
    // First call - search results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        query: {
          search: [
            {
              title: 'Test Article',
              pageid: 12345,
              snippet: 'Test snippet',
              timestamp: '2024-01-01T00:00:00Z'
            }
          ]
        }
      })
    });

    // Second call - page content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        query: {
          pages: {
            '12345': {
              pageid: 12345,
              title: 'Test Article',
              extract: '<p>Test article content</p>',
              fullurl: 'https://en.wikipedia.org/wiki/Test%20Article',
              categories: [{ title: 'Category:Test' }],
              images: [{ 
                title: 'Test.jpg',
                url: 'https://example.com/test.jpg'
              }],
              thumbnail: {
                source: 'https://example.com/thumb.jpg',
                width: 100,
                height: 100
              },
              extract_html: 'Test summary'
            }
          }
        }
      })
    });

    global.fetch = mockFetch;

    // Mock individual methods on the wiki object
    vi.spyOn(wiki, 'setLang').mockReturnValue('en');
    vi.spyOn(wiki, 'search').mockResolvedValue({
      results: [{
        title: 'Test Article',
        pageid: 12345,
      }],
      suggestion: '',
    });
  });

  it('should fetch and parse Wikipedia content correctly', async () => {
    // Create a partial mock of the Page class for this test
    const mockPage = {
      title: 'Test Article',
      pageid: 12345,
      ns: 0,
      contentmodel: 'wikitext',
      pagelanguage: 'en',
      pagelanguagehtmlcode: 'en',
      intro: vi.fn().mockResolvedValue('<p>Test article content</p>'),
      categories: vi.fn().mockResolvedValue(['Category:Test']),
      images: vi.fn().mockResolvedValue([
        { title: 'Test.jpg', url: 'https://example.com/test.jpg' }
      ]),
      summary: vi.fn().mockResolvedValue({
        extract: 'Test summary',
        thumbnail: {
          source: 'https://example.com/thumb.jpg',
          width: 100,
          height: 100,
        },
      }),
      fullurl: 'https://en.wikipedia.org/wiki/Test%20Article',
      editurl: 'https://en.wikipedia.org/wiki/Test%20Article?action=edit',
      canonicalurl: 'https://en.wikipedia.org/wiki/Test%20Article',
    } as unknown as Page;

    vi.spyOn(wiki, 'page').mockResolvedValue(mockPage);

    const result = await wikiTool.run({
      query: 'test article',
      includeCategories: true,
      includeImages: true,
      extractFormat: 'plain'
    });

    const content = JSON.parse(result.getContent());
    expect(content).toMatchObject({
      title: 'Test Article',
      extract: '<p>Test article content</p>',
      pageId: 12345,
      url: 'https://en.wikipedia.org/wiki/Test%20Article',
      categories: ['Category:Test'],
      images: ['https://example.com/test.jpg'],
      similarityScore: 1,
      summary: {
        extract: 'Test summary',
        thumbnail: {
          source: 'https://example.com/thumb.jpg',
          width: 100,
          height: 100,
        },
      },
    });
  });

  // Clean up after tests
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Other tests remain unchanged
});