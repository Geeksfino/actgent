import { LoggerFactory } from '../core/Logger';

export const runtimeLoggers = {
    // Runtime environment
    environment: LoggerFactory.getLogger({
        module: 'runtime',
        component: 'environment',
        tags: ['detection', 'setup']
    }),

    // Runtime features
    features: LoggerFactory.getLogger({
        module: 'runtime',
        component: 'features',
        tags: ['capability', 'check']
    }),

    // Runtime events
    events: LoggerFactory.getLogger({
        module: 'runtime',
        component: 'events',
        tags: ['dispatch', 'handle']
    }),

    // Runtime plugins
    plugins: LoggerFactory.getLogger({
        module: 'runtime',
        component: 'plugins',
        tags: ['load', 'initialize']
    }),

    // Runtime lifecycle
    lifecycle: LoggerFactory.getLogger({
        module: 'runtime',
        component: 'lifecycle',
        tags: ['start', 'shutdown']
    })
};
