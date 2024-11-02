import { describe, it, expect, vi, beforeEach } from "vitest";
import { SerpSearchTool } from "../serp";
import { ExecutionContext } from "../../core/ExecutionContext";

describe("SerpSearchTool", () => {
  let tool: SerpSearchTool;
  let mockFetch: any;

  const mockSuccessResponse = {
    searchParameters: {
      q: "test query",
      gl: "us",
      hl: "en",
      type: "search"
    },
    knowledgeGraph: {
      title: "Test Topic",
      type: "Test Type",
      description: "This is a test description",
      website: "https://test.com",
      attributes: {
        key: "value"
      }
    },
    organic: [
      {
        title: "Test Result 1",
        link: "https://test1.com",
        snippet: "This is test result 1",
        position: 1,
        sitelinks: [
          {
            title: "Sublink 1",
            link: "https://test1.com/sub1"
          }
        ]
      },
      {
        title: "Test Result 2",
        link: "https://test2.com",
        snippet: "This is test result 2",
        position: 2
      }
    ],
    peopleAlsoAsk: [
      {
        question: "Test question?",
        snippet: "Test answer",
        title: "Test Source",
        link: "https://test-source.com"
      }
    ]
  };

  beforeEach(() => {
    // Mock environment variable
    process.env.SERP_API_KEY = "test-api-key";

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Create tool instance
    tool = new SerpSearchTool();
  });

  it("should be properly initialized", () => {
    expect(tool).toBeInstanceOf(SerpSearchTool);
    expect(tool.name).toBe("SerpSearch");
    expect(tool.description).toContain("Google SERP API");
  });

  it("should throw error if API key is not provided", () => {
    delete process.env.SERP_API_KEY;
    expect(() => new SerpSearchTool()).toThrow("SERP_API_KEY environment variable is required");
  });

  it("should validate input schema", () => {
    const schema = tool.schema();
    
    // Valid input
    expect(schema.safeParse({ query: "test" }).success).toBe(true);
    expect(schema.safeParse({ query: "test", maxResults: 10 }).success).toBe(true);

    // Invalid input
    expect(schema.safeParse({ query: "" }).success).toBe(false);
    expect(schema.safeParse({ query: "test", maxResults: 0 }).success).toBe(false);
    expect(schema.safeParse({ query: "test", maxResults: 26 }).success).toBe(false);
  });

  it("should perform search and return results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    });

    const result = await tool.run({
      query: "test query",
      maxResults: 3
    });

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      "https://google.serper.dev/search",
      expect.objectContaining({
        method: "POST",
        headers: {
          "X-API-KEY": "test-api-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          q: "test query",
          gl: "us",
          hl: "en"
        })
      })
    );

    // Parse results
    const searchResults = JSON.parse(result.getContent());

    // Verify results structure
    expect(searchResults).toHaveLength(3); // Knowledge graph + 2 organic results
    expect(searchResults[0]).toEqual({
      title: "Test Topic",
      link: "https://test.com",
      snippet: "This is a test description",
      position: 0
    });

    // Verify metadata
    expect(result.metadata).toEqual({
      query: "test query",
      totalResults: 3,
      hasKnowledgeGraph: true,
      peopleAlsoAskCount: 1
    });
  });

  it("should handle API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401
    });

    await expect(tool.run({ query: "test" })).rejects.toThrow("HTTP error! status: 401");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(tool.run({ query: "test" })).rejects.toThrow("SERP search error: Network error");
  });

  it("should respect maxResults parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse)
    });

    const result = await tool.run({
      query: "test query",
      maxResults: 1
    });

    const searchResults = JSON.parse(result.getContent());
    expect(searchResults).toHaveLength(1);
  });

  it("should handle response without knowledge graph", async () => {
    // Create a new object type with optional knowledgeGraph
    const responseWithoutKG: Partial<typeof mockSuccessResponse> = {
      searchParameters: mockSuccessResponse.searchParameters,
      organic: mockSuccessResponse.organic,
      peopleAlsoAsk: mockSuccessResponse.peopleAlsoAsk
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(responseWithoutKG)
    });

    const result = await tool.run({ query: "test query" });
    const searchResults = JSON.parse(result.getContent());

    expect(searchResults[0].title).toBe("Test Result 1");
    expect(result.metadata?.hasKnowledgeGraph).toBe(false);
  });
}); 