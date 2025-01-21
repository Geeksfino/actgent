import { LoggerFactory } from './Logger';

export const coreLoggers = {
    // Message processing
    messageLoop: LoggerFactory.getLogger({
        module: 'core',
        component: 'message-loop',
        tags: ['prompt', 'llm-response']
    }),

    // Classification and prompting
    classifier: LoggerFactory.getLogger({
        module: 'core',
        component: 'classifier',
        tags: ['parse', 'validate']
    }),

    promptTemplate: LoggerFactory.getLogger({
        module: 'core',
        component: 'prompt-template',
        tags: ['generation', 'render']
    }),

    promptManager: LoggerFactory.getLogger({
        module: 'core',
        component: 'prompt-manager',
        tags: ['system-prompt', 'assistant-prompt']
    }),

    // Session management
    session: LoggerFactory.getLogger({
        module: 'core',
        component: 'session',
        tags: ['context', 'state']
    }),

    // Tool management
    tool: LoggerFactory.getLogger({
        module: 'core',
        component: 'tool',
        tags: ['registration', 'execution']
    }),

    // Core system
    inbox: LoggerFactory.getLogger({
        module: 'core',
        component: 'inbox',
        tags: ['priority', 'queue']
    }),

    context: LoggerFactory.getLogger({
        module: 'core',
        component: 'context',
        tags: ['execution', 'inference']
    })
};
