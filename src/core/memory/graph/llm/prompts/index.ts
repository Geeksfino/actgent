/**
 * Prompt templates for graph operations
 */
export const graphPrompts = {
  generateEmbedding: (text: string) => ({
    messages: [{
      role: 'system',
      content: 'You are a semantic embedding generator. Generate a 384-dimensional vector that captures the semantic meaning of the input text. Values should be between -1 and 1.'
    }, {
      role: 'user',
      content: `Text: "${text}"\nReturn only the JSON array of numbers.`
    }]
  }),

  rerank: (query: string, results: any[]) => ({
    messages: [{
      role: 'system',
      content: 'You are a search result ranker. Analyze and rank results by their relevance to the query considering semantic similarity, temporal context, and information quality.'
    }, {
      role: 'user',
      content: `Query: "${query}"
Results: ${JSON.stringify(results, null, 2)}
Return: JSON array of { id, score, content, metadata } ordered by relevance.`
    }]
  }),

  findPath: (start: any, end: any, nodes: any[], edges: any[]) => ({
    messages: [{
      role: 'system',
      content: 'You are a graph pathfinding expert. Find the most meaningful path between two nodes considering semantic relationships and edge weights.'
    }, {
      role: 'user',
      content: `Find path from "${start.id}" to "${end.id}"
Available nodes: ${JSON.stringify(nodes, null, 2)}
Available edges: ${JSON.stringify(edges, null, 2)}
Return: { nodes: string[], edges: string[], cost: number, explanation: string }`
    }]
  }),

  detectCommunities: (nodes: any[], edges: any[]) => ({
    messages: [{
      role: 'system',
      content: 'You are a community detection expert. Group nodes into meaningful communities based on their relationships and semantic similarity.'
    }, {
      role: 'user',
      content: `Nodes: ${JSON.stringify(nodes, null, 2)}
Edges: ${JSON.stringify(edges, null, 2)}
Return: { communities: [{ id: string, nodes: string[], summary: string, confidence: number }] }`
    }]
  }),

  extractTemporal: (text: string, referenceTime: string) => ({
    messages: [{
      role: 'system',
      content: 'You are a temporal information extractor. Extract and normalize temporal expressions from text.'
    }, {
      role: 'user',
      content: `Text: "${text}"
Reference Time: ${referenceTime}
Return: { eventTime: ISO string, ingestionTime: ISO string, validFrom?: ISO string, validTo?: ISO string, confidence: number }`
    }]
  })
};
