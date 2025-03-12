import { vi } from 'vitest';

// Create a properly typed mock fetch function for Bun environment
export function createMockFetch() {
  // Start with a basic mock function
  const mockFetchFn = vi.fn();
  
  // Create an object that satisfies both the fetch interface and mock methods
  const mockFetch: any = (...args: any[]) => mockFetchFn(...args);
  
  // Add the preconnect method required by Bun's fetch implementation
  mockFetch.preconnect = vi.fn();
  
  // Add mock methods from vitest
  mockFetch.mockResolvedValueOnce = mockFetchFn.mockResolvedValueOnce.bind(mockFetchFn);
  mockFetch.mockRejectedValueOnce = mockFetchFn.mockRejectedValueOnce.bind(mockFetchFn);
  mockFetch.mockImplementation = mockFetchFn.mockImplementation.bind(mockFetchFn);
  mockFetch.mockReset = mockFetchFn.mockReset.bind(mockFetchFn);
  mockFetch.mockClear = mockFetchFn.mockClear.bind(mockFetchFn);
  
  return mockFetch as typeof fetch & {
    mockResolvedValueOnce: (value: any) => any;
    mockRejectedValueOnce: (reason: any) => any;
    mockImplementation: (fn: (...args: any[]) => any) => any;
    mockReset: () => any;
    mockClear: () => any;
  };
}
