/**
 * Evaluates message relevance based on context
 */
export class RelevanceEvaluator {
    /**
     * Evaluate relevance of a message in given context
     */
    public evaluateRelevance(message: string, context: string): number {
        const messageKeywords = this.extractKeywords(message);
        const contextKeywords = this.extractKeywords(context);
        return this.computeSimilarity(messageKeywords, contextKeywords);
    }

    /**
     * Compute similarity between two sets of keywords
     */
    private computeSimilarity(keywords1: string[], keywords2: string[]): number {
        const set1 = new Set(keywords1);
        const set2 = new Set(keywords2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    /**
     * Extract keywords from text
     */
    private extractKeywords(text: string): string[] {
        // TODO: Implement proper keyword extraction
        // This is a simple implementation for now
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);
    }
}
