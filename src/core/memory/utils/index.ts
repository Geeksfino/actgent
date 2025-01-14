import { BaseMetadata, MemoryFilter } from '../types';

// Helper functions for memory module

export function metadataToMap(metadata: BaseMetadata): Map<string, any> {
    return new Map(Object.entries(metadata));
}

export function mapToMetadata<T extends BaseMetadata>(map: Map<string, any>): T {
    const obj: any = {};
    map.forEach((value, key) => {
        obj[key] = value;
    });
    return obj as T;
}

/**
 * Helper function to build query string from memory filter
 */
export function buildQueryFromFilter(filter: MemoryFilter): string {
    const queryParts: string[] = [];

    if (filter.types?.length) {
        queryParts.push(`type:(${filter.types.join(' OR ')})`);
    }

    if (filter.dateRange) {
        if (filter.dateRange.start) {
            queryParts.push(`timestamp >= ${filter.dateRange.start.toISOString()}`);
        }
        if (filter.dateRange.end) {
            queryParts.push(`timestamp <= ${filter.dateRange.end.toISOString()}`);
        }
    }

    if (filter.id) {
        queryParts.push(`id:${filter.id}`);
    }

    if (filter.metadataFilters?.length) {
        for (const metadataFilter of filter.metadataFilters) {
            for (const [key, value] of metadataFilter.entries()) {
                queryParts.push(`metadata.${key}:${value}`);
            }
        }
    }

    if (filter.contentFilters?.length) {
        for (const contentFilter of filter.contentFilters) {
            for (const [key, value] of contentFilter.entries()) {
                queryParts.push(`content.${key}:${value}`);
            }
        }
    }

    if (filter.query) {
        queryParts.push(filter.query);
    }

    return queryParts.join(' AND ');
}
