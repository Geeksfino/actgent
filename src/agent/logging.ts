import { LoggerFactory } from '../core/Logger';

export const agentLoggers = {
    // Base agent functionality
    agent: LoggerFactory.getLogger({
        module: 'agent'
    }),

    // Communication
    network: LoggerFactory.getLogger({
        module: 'agent',
        component: 'network'
    }),

    classifier: LoggerFactory.getLogger({
        module: 'agent',
        component: 'classifier'
    }),

    promptTemplate: LoggerFactory.getLogger({
        module: 'agent',
        component: 'prompt-template'
    })
};
