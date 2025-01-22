import { LoggerFactory } from '../core/Logger';

export const toolLoggers = {
    // Search tools
    search: LoggerFactory.getLogger({
        module: 'tools'
    }),
};
