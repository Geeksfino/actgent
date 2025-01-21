import { LoggerFactory } from '../core/Logger';

export const toolLoggers = {
    // Search tools
    search: LoggerFactory.getLogger({
        module: 'tools',
        component: 'search',
        tags: ['web', 'query']
    }),

    // Web tools
    web: LoggerFactory.getLogger({
        module: 'tools',
        component: 'web',
        tags: ['crawler', 'scraping']
    }),

    // System tools
    system: LoggerFactory.getLogger({
        module: 'tools',
        component: 'system',
        tags: ['script', 'execution']
    }),

    // Database tools
    database: LoggerFactory.getLogger({
        module: 'tools',
        component: 'database',
        tags: ['sql', 'query']
    }),

    // API tools
    api: LoggerFactory.getLogger({
        module: 'tools',
        component: 'api',
        tags: ['request', 'response']
    }),

    // Weather tools
    weather: LoggerFactory.getLogger({
        module: 'tools',
        component: 'weather',
        tags: ['forecast', 'data']
    })
};
