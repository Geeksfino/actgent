import { IMemoryUnit } from './types';

/**
 * Abstract factory class for creating declarative memory units
 */
export abstract class DeclarativeMemoryFactory {
    /**
     * Create a memory unit from content and metadata
     */
    abstract createMemoryUnit(content: any, metadata?: Map<string, any>): IMemoryUnit;

    /**
     * Protected utility method to generate timestamp
     */
    protected generateTimestamp(): Date {
        return new Date();
    }

    /**
     * Protected utility method to merge default metadata with provided metadata
     */
    protected mergeMetadata(defaultMetadata: Map<string, any>, providedMetadata?: Map<string, any>): Map<string, any> {
        const mergedMetadata = new Map(defaultMetadata);
        if (providedMetadata) {
            for (const [key, value] of providedMetadata) {
                mergedMetadata.set(key, value);
            }
        }
        return mergedMetadata;
    }
}
