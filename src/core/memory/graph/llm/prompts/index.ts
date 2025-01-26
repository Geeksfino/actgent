/**
 * Prompt templates for graph operations using hybrid approach
 */
export const graphPrompts = {
  prepareForEmbedding: (text: string) => ({
    messages: [{
      role: 'system',
      content: `You are a semantic analysis expert. Your task is to analyze text and identify key concepts and context that would help in generating accurate embeddings.

Focus on:
- Main topics and themes
- Important technical terms
- Contextual information that helps disambiguation
- Relationships between concepts

Use the prepare_for_embedding function to structure your analysis.`
    }, {
      role: 'user',
      content: `Analyze this text for embedding preparation: "${text}"`
    }]
  }),

  rerank: (query: string, results: any[]) => ({
    messages: [{
      role: 'system',
      content: `You are a search relevance expert. Your task is to analyze search results and rank them based on:
- Direct relevance to the query
- Semantic similarity
- Information quality and completeness
- Query intent understanding

Use the update_search_ranks function to provide your analysis and rankings.`
    }, {
      role: 'user',
      content: `Query: "${query}"
Results to rank:
${JSON.stringify(results, null, 2)}`
    }]
  }),

  evaluatePaths: (paths: any[], start: any, end: any) => ({
    messages: [{
      role: 'system',
      content: `You are a graph analysis expert. Your task is to evaluate algorithmically found paths by:
- Understanding the semantic meaning of each connection
- Evaluating the relevance of each path to the user's goal
- Explaining why certain paths might be more meaningful
- Identifying key relationships along each path

Use the evaluate_paths function to provide your analysis.`
    }, {
      role: 'user',
      content: `Evaluate these paths from "${start.id}" to "${end.id}":

Available paths:
${JSON.stringify(paths, null, 2)}

Start node context:
${JSON.stringify(start, null, 2)}

End node context:
${JSON.stringify(end, null, 2)}`
    }]
  }),

  refineCommunities: (communities: any[], nodes: any[], edges: any[]) => ({
    messages: [{
      role: 'system',
      content: `You are a community analysis expert. Your task is to refine algorithmically detected communities by:
- Understanding the semantic meaning of each community
- Suggesting meaningful names and descriptions
- Identifying relationships between communities
- Evaluating the confidence of community assignments

Use the refine_communities function to provide your analysis.`
    }, {
      role: 'user',
      content: `Analyze and refine these detected communities:

Communities:
${JSON.stringify(communities, null, 2)}

Available nodes:
${JSON.stringify(nodes, null, 2)}

Available edges:
${JSON.stringify(edges, null, 2)}`
    }]
  }),

  extractTemporal: (text: string, referenceTime: string) => ({
    messages: [{
      role: 'system',
      content: `You are a temporal analysis expert. Your task is to:
- Extract temporal relationships from text
- Understand relative and absolute time references
- Consider the given reference time for context
- Assign confidence scores to temporal relationships

Use the add_temporal_edges function to describe the temporal relationships you identify.`
    }, {
      role: 'user',
      content: `Analyze temporal relationships in this text:
"${text}"

Reference time: ${referenceTime}`
    }]
  })
};
