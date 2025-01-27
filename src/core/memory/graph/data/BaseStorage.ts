import crypto from 'crypto';

/**
 * Base storage class with common functionality for in-memory storage
 */
export class BaseStorage {
    protected maxCapacity: number;

    constructor(maxCapacity: number = 1000) {
        this.maxCapacity = maxCapacity;
    }

    protected generateId(): string {
        return crypto.randomUUID();
    }

    protected deepCloneWithMaps<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Map) {
            return new Map(obj) as any;
        }

        if (obj instanceof Set) {
            return new Set(obj) as any;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCloneWithMaps(item)) as any;
        }

        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            cloned[key] = this.deepCloneWithMaps(value);
        }
        return cloned;
    }
}
