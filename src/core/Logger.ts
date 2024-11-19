import pino from 'pino';
import path from 'path';
import pinoPretty from "pino-pretty";
import { LoggingConfig } from './configs';
import { createRuntime } from '../runtime';
import { RuntimeType } from '../runtime/types';

// Use Pino's levels directly
export enum LogLevel {
    TRACE = 'trace',
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warn',
    ERROR = 'error',
    FATAL = 'fatal'
}

// Custom pretty print options
const prettyPrintOptions: pinoPretty.PrettyOptions = {
    colorize: true,
    levelFirst: true,
    translateTime: "SYS:standard",
    ignore: "hostname,pid,env",
    customColors: 'trace:gray,debug:yellow,info:green,warn:blue,error:red,fatal:magenta'
};

// Custom transport for Tauri logging
const tauriTransport = {
    target: 'pino/file',
    options: {
        ...prettyPrintOptions,
        destination: 1, // stdout
        transform: async (obj: any) => {
            const runtime = createRuntime();
            // Only process if we're in Tauri environment
            if (runtime.runtimeType === RuntimeType.TAURI) {
                const { trace, debug, info, warn, error } = await import('@tauri-apps/plugin-log');
                const msg = obj.msg;
                switch (obj.level) {
                    case 10: // trace
                        await trace(msg);
                        break;
                    case 20: // debug
                        await debug(msg);
                        break;
                    case 30: // info
                        await info(msg);
                        break;
                    case 40: // warn
                        await warn(msg);
                        break;
                    case 50: // error
                    case 60: // fatal
                        await error(msg);
                        break;
                }
            }
            return obj;
        }
    }
};

export class Logger {
    private static instance: Logger;
    private logger: pino.Logger;
    private currentOptions: pinoPretty.PrettyOptions;
    private currentLevel: LogLevel = LogLevel.WARNING;
    private runtime = createRuntime();

    private constructor() {
        this.currentOptions = prettyPrintOptions;
        this.logger = this.createLogger(this.currentLevel);
    }

    private createLogger(level: LogLevel): pino.Logger {
        const transports = [];

        // Always add pretty print transport for console
        transports.push({
            target: 'pino-pretty',
            options: {
                ...this.currentOptions,
                messageFormat: '{msg}'
            }
        });

        // If we're in Tauri environment, add Tauri transport
        if (this.runtime.runtimeType === RuntimeType.TAURI) {
            transports.push(tauriTransport);
        }

        return pino({
            level,
            transport: {
                targets: transports
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

    public getLevel(): LogLevel {
        return this.currentLevel;
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

    private formatErrorMessage(message: string, args: any[]): object {
        const stack = new Error().stack?.split('\n');
        let callerInfo = 'unknown';

        if (stack) {
            // Skip the first few lines that belong to the logger itself
            for (let i = 2; i < stack.length; i++) {
                if (!stack[i].includes('Logger.')) {
                    callerInfo = stack[i].trim();
                    break;
                }
            }
        }

        // Attempt to extract class and function names
        const match = callerInfo.match(/at (\S+) \(([^)]+)\)/) || callerInfo.match(/at (\S+)/);
        const [className, functionName] = match ? match.slice(1) : ['unknown', 'unknown'];

        const formattedMessage = `[${className}.${functionName}] ${message}`;

        return args.length > 0 
            ? { msg: formattedMessage, data: this.formatArgs(args) }
            : { msg: formattedMessage };
    }

    // Define a simple formatMessage method
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
        this.logger.error(this.formatErrorMessage(message, args));
    }

    public trace(message: string, ...args: any[]) {
        this.logger.trace(this.formatMessage(message, args));
    }

    public fatal(message: string, ...args: any[]) {
        this.logger.fatal(this.formatErrorMessage(message, args));
    }

    public static parseLogLevel(level: string): LogLevel {
        const upperLevel = level.toUpperCase();
        switch (upperLevel) {
            case 'TRACE': return LogLevel.TRACE;
            case 'DEBUG': return LogLevel.DEBUG;
            case 'INFO': return LogLevel.INFO;
            case 'WARNING': return LogLevel.WARNING;
            case 'ERROR': return LogLevel.ERROR;
            case 'FATAL': return LogLevel.FATAL;
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