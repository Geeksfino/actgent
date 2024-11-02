import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BingSearchTool } from '../bingSearch';
import { ExecutionContext } from '../../core/ExecutionContext';

describe('BingSearchTool', () => {
  let bingSearch: BingSearchTool;
  let mockFetch: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
    
    // Create a mock fetch function
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    
    // Initialize the tool with a test API key
    bingSearch = new BingSearchTool('test-api-key');
  });

  describe('input validation', () => {
    it('should require a query string', async () => {
      await expect(bingSearch.run({ query: '' })).rejects.toThrow('Input validation failed');
    });

    it('should limit maxResults between 1 and 50', async () => {
      await expect(bingSearch.run({ 
        query: 'test',
        maxResults: 51 
      })).rejects.toThrow('Input validation failed');

      await expect(bingSearch.run({ 
        query: 'test',
        maxResults: 0 
      })).rejects.toThrow('Input validation failed');
    });
  });

  describe('search functionality', () => {
    const mockSearchResponse = {
      webPages: {
        value: [
          {
            name: 'Test Result 1',
            url: 'https://test1.com',
            snippet: 'Test snippet 1'
          },
          {
            name: 'Test Result 2',
            url: 'https://test2.com',
            snippet: 'Test snippet 2'
          }
        ]
      }
    };

    it('should perform a basic search successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      });

      const result = await bingSearch.run({ 
        query: 'test query',
        maxResults: 2
      });

      const content = JSON.parse(result.getContent());

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.bing.microsoft.com/v7.0/search'),
        expect.objectContaining({
          headers: {
            'Ocp-Apim-Subscription-Key': 'test-api-key',
            'Accept': 'application/json'
          }
        })
      );

      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({
        title: 'Test Result 1',
        link: 'https://test1.com',
        snippet: 'Test snippet 1'
      });
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'API Error'
      });

      await expect(bingSearch.run({ 
        query: 'test query' 
      })).rejects.toThrow('Bing search error: Search failed: API Error');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(bingSearch.run({ 
        query: 'test query' 
      })).rejects.toThrow('Bing search error: Network error');
    });

    it('should handle empty results gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ webPages: { value: [] } })
      });

      const result = await bingSearch.run({ query: 'test query' });
      const content = JSON.parse(result.getContent());

      expect(content).toEqual([]);
      expect(result.metadata).toEqual({
        query: 'test query',
        totalResults: 0
      });
    });
  });

  describe('API key handling', () => {
    it('should use provided API key over environment variable', async () => {
      process.env.BING_API_KEY = 'env-api-key';
      const tool = new BingSearchTool('provided-api-key');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ webPages: { value: [] } })
      });

      await tool.run({ query: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Ocp-Apim-Subscription-Key': 'provided-api-key'
          })
        })
      );
    });

    it('should throw error when no API key is provided', async () => {
      delete process.env.BING_API_KEY;
      await expect(new BingSearchTool().run({ query: 'test' }))
        .rejects.toThrow('Bing API key is required');
    });
  });
}); 