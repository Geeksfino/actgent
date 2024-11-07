import pino from 'pino';
import path from 'path';
import pinoPretty from "pino-pretty";
import { LoggingConfig } from './configs';

// Use Pino's levels directly
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warn',
    ERROR = 'error'
}

// Custom pretty print options
const prettyPrintOptions: pinoPretty.PrettyOptions = {
    colorize: true,
    levelFirst: true,
    translateTime: "SYS:standard",
    ignore: "hostname,pid,env",
    customColors: 'debug:gray,info:green,warn:blue,error:red'
};

export class Logger {
    private static instance: Logger;
    private logger: pino.Logger;
    private currentOptions: pinoPretty.PrettyOptions;
    private currentLevel: LogLevel = LogLevel.WARNING; // Track current level

    private constructor() {
        this.currentOptions = prettyPrintOptions;
        this.logger = this.createLogger(this.currentLevel);
    }

    // Helper method to create logger with consistent configuration
    private createLogger(level: LogLevel): pino.Logger {
        return pino({
            level,
            transport: {
                target: 'pino-pretty',
                options: {
                    ...this.currentOptions,
                    messageFormat: '{msg}'
                }
            }
        });
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setDestination(config?: LoggingConfig) {
        if (!config) {
            // Default to console logging
            this.currentOptions = {
                ...prettyPrintOptions
            };
        } else {
            // If destination is present but type isn't specified, default to 'file'
            const type = config.destination ? (config.type || 'file') : (config.type || 'console');
            
            switch (type) {
                case 'file':
                    if (!config.destination) {
                        throw new Error('Destination path is required for file logging');
                    }
                    this.currentOptions = {
                        ...prettyPrintOptions,
                        destination: config.destination
                    };
                    break;
                    
                case 'both':
                    if (!config.destination) {
                        throw new Error('Destination path is required for file logging');
                    }
                    this.currentOptions = {
                        ...prettyPrintOptions,
                        destination: config.destination
                    };
                    break;
                    
                case 'console':
                default:
                    // Console only
                    this.currentOptions = {
                        ...prettyPrintOptions
                    };
                    break;
            }
        }
        
        // Set the level if provided
        if (config?.level) {
            this.currentLevel = config.level as LogLevel;
        }
        
        this.logger = this.createLogger(this.currentLevel);
    }

    public setLevel(level: LogLevel) {
        this.currentLevel = level;
        this.logger = this.createLogger(level);
    }

    private formatArgs(...args: any[]): any[] {
        return args.map(arg => {
            if (arg instanceof Error) {
                const { message, stack, ...rest } = arg;
                return {
                    type: 'Error',
                    message,
                    stack,
                    details: rest
                };
            }
            if (typeof arg === 'object') {
                return arg;
            }
            return String(arg);
        });
    }

    private formatMessage(message: string, args: any[]): object {
        return args.length > 0 
            ? { msg: message, data: this.formatArgs(args) }
            : { msg: message };
    }

    public debug(message: string, ...args: any[]) {
        this.logger.debug(this.formatMessage(message, args));
    }

    public info(message: string, ...args: any[]) {
        this.logger.info(this.formatMessage(message, args));
    }

    public warning(message: string, ...args: any[]) {
        this.logger.warn(this.formatMessage(message, args));
    }

    public error(message: string, ...args: any[]) {
        this.logger.error(this.formatMessage(message, args));
    }

    public static parseLogLevel(level: string): LogLevel {
        const upperLevel = level.toUpperCase();
        switch (upperLevel) {
            case 'DEBUG': return LogLevel.DEBUG;
            case 'INFO': return LogLevel.INFO;
            case 'WARNING': return LogLevel.WARNING;
            case 'ERROR': return LogLevel.ERROR;
            default: return LogLevel.INFO;
        }
    }
}

// Export a singleton instance
export const logger = Logger.getInstance();

// Re-export the trace decorator
export function trace() {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const className = target.constructor.name;

        descriptor.value = function (...args: any[]) {
            const logger = Logger.getInstance();
            logger.debug(`${className}.${propertyKey} called from:`, new Error().stack?.split('\n')[2]);
            const result = originalMethod.apply(this, args);
            return result;
        };

        return descriptor;
    };
}