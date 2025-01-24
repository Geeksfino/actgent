/**
 * Result reranking strategies
 */
export class ResultReranker {
    /**
     * Apply Reciprocal Rank Fusion
     * Combines multiple ranked lists giving higher weight to items that appear high in multiple lists
     */
    applyRRF(results: Array<Array<{ id: string; score: number }>>): Array<{ id: string; score: number }> {
        const scores = new Map<string, number>();
        const k = 60; // constant from RRF paper

        for (const ranking of results) {
            ranking.forEach((item, rank) => {
                const rrf_k = 1 / (k + rank + 1);
                scores.set(item.id, (scores.get(item.id) || 0) + rrf_k);
            });
        }

        return Array.from(scores.entries())
            .map(([id, score]) => ({ id, score }))
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Apply Maximal Marginal Relevance
     * Balances relevance with diversity in the result set
     */
    applyMMR(results: Array<{ id: string; score: number; embedding?: number[] }>, lambda: number = 0.5): Array<{ id: string; score: number }> {
        if (!results[0]?.embedding) {
            return results; // If no embeddings, return original order
        }

        const selected: typeof results = [];
        const candidates = [...results];

        while (selected.length < results.length) {
            let maxMMR = -Infinity;
            let bestIdx = 0;

            for (let i = 0; i < candidates.length; i++) {
                const sim1 = candidates[i].score;
                let sim2 = 0;

                if (selected.length > 0) {
                    sim2 = Math.max(...selected.map(s => 
                        this.cosineSimilarity(candidates[i].embedding!, s.embedding!)
                    ));
                }

                const mmr = lambda * sim1 - (1 - lambda) * sim2;
                if (mmr > maxMMR) {
                    maxMMR = mmr;
                    bestIdx = i;
                }
            }

            selected.push(candidates[bestIdx]);
            candidates.splice(bestIdx, 1);
        }

        return selected;
    }

    /**
     * Apply graph-based episode mentions reranking
     * Prioritizes results based on frequency of entity mentions
     */
    applyMentionsReranking(results: Array<{ id: string; score: number }>, mentionCounts: Map<string, number>): Array<{ id: string; score: number }> {
        return results.map(result => ({
            id: result.id,
            score: result.score * (1 + Math.log(mentionCounts.get(result.id) || 1))
        })).sort((a, b) => b.score - a.score);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
