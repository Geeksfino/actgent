import { LoggerFactory } from '../core/Logger';

export const agentLoggers = {
    // Base agent functionality
    agent: LoggerFactory.getLogger({
        module: 'agent',
        component: 'base',
        tags: ['lifecycle', 'state']
    }),

    // Agent registry
    registry: LoggerFactory.getLogger({
        module: 'agent',
        component: 'registry',
        tags: ['registration', 'lookup']
    }),

    // Communication
    communication: LoggerFactory.getLogger({
        module: 'agent',
        component: 'communication',
        tags: ['message', 'protocol']
    }),

    // ReAct implementation
    react: LoggerFactory.getLogger({
        module: 'agent',
        component: 'react',
        tags: ['reasoning', 'action']
    }),

    // Multi-level implementation
    multilevel: LoggerFactory.getLogger({
        module: 'agent',
        component: 'multilevel',
        tags: ['hierarchy', 'delegation']
    }),

    // Simple implementation
    simple: LoggerFactory.getLogger({
        module: 'agent',
        component: 'simple',
        tags: ['direct', 'basic']
    }),

    // Agent builder
    builder: LoggerFactory.getLogger({
        module: 'agent',
        component: 'builder',
        tags: ['configuration', 'setup']
    })
};
