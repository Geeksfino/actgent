import { LoggerFactory } from '../core/Logger';

export const runtimeLoggers = {
    // Runtime environment
    environment: LoggerFactory.getLogger({
        module: 'runtime'
    }),
};
