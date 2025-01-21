import { LoggerFactory } from '../Logger';

// Memory module loggers for different memory types
export const memoryLoggers = {
    // Memory type specific loggers
    ephemeral: LoggerFactory.getLogger({
        module: 'memory',
        component: 'ephemeral'
    }),

    working: LoggerFactory.getLogger({
        module: 'memory',
        component: 'working'
    }),

    episodic: LoggerFactory.getLogger({
        module: 'memory',
        component: 'episodic'
    }),

    semantic: LoggerFactory.getLogger({
        module: 'memory',
        component: 'semantic'
    }),

    procedural: LoggerFactory.getLogger({
        module: 'memory',
        component: 'procedural'
    }),

    monitor: LoggerFactory.getLogger({
        module: 'memory',
        component: 'monitor'
    }),

    system: LoggerFactory.getLogger({
        module: 'memory',
        component: 'system'
    })
};
