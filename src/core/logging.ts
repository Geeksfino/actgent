import { LoggerFactory } from './Logger';

export const coreLoggers = {
    // Message processing
    main: LoggerFactory.getLogger({
        module: 'core',
        component: 'main'
    }),

    // Classification and prompting
    classifier: LoggerFactory.getLogger({
        module: 'core',
        component: 'classifier'
    }),

    prompt: LoggerFactory.getLogger({
        module: 'core',
        component: 'prompt-template'
    }),

    // Session management
    session: LoggerFactory.getLogger({
        module: 'core',
        component: 'session'
    }),

    // Tool management
    tool: LoggerFactory.getLogger({
        module: 'core',
        component: 'tool'
    }),
};
