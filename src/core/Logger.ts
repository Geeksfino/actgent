import pino from 'pino';
import pinoPretty from "pino-pretty";
import { LoggingConfig } from './configs';
import { createRuntime } from '../runtime';
import { RuntimeType } from '../runtime/types';

// Use Pino's levels directly
export enum LogLevel {
    TRACE = 'trace',
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal'
}

// Types for log data and context
interface LogData {
    msg: string;
    data?: any;
    tags?: string[];
    [key: string]: any;
}

export interface LogContext {
    module: string;
    component?: string;
    tags?: string[];
    [key: string]: any;
}
interface LogLevelPattern {
    module?: string;
    component?: string;
    tags?: string[];
    level: LogLevel;
    priority: number;
}

// Helper to add tags to log data
export function withTags<T extends object = {}>(tags: string[], data?: T): T & { tags: string[] } {
    return { ...(data || {} as T), tags };
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
    private static patterns: LogLevelPattern[] = [];
    private static contextLoggers: Set<Logger> = new Set();
    private logger: pino.Logger;
    private currentOptions: pinoPretty.PrettyOptions;
    private currentLevel: LogLevel = LogLevel.INFO;
    private runtime = createRuntime();
    private bindings?: LogContext;

    private constructor() {
        this.currentOptions = prettyPrintOptions;
        this.parseDebugPatterns();
        this.logger = this.createLogger(this.currentLevel);
    }

    private parseDebugPatterns() {
        const debug = process.env.DEBUG;
        if (!debug) return;

        const patterns: LogLevelPattern[] = [];
        
        debug.split(',').forEach(pattern => {
            pattern = pattern.trim();
            if (!pattern) return;

            // Parse pattern: mod:name[=level] or mod:name/comp[=level] or tag:name[=level]
            // Level is optional, defaults to DEBUG
            let selector: string;
            let level = LogLevel.DEBUG;  // Default to DEBUG if not specified

            if (pattern.includes('=')) {
                const [sel, levelStr] = pattern.split('=');
                selector = sel;
                const parsedLevel = Logger.parseLogLevel(levelStr.trim());
                if (parsedLevel) {
                    level = parsedLevel;
                }
            } else {
                selector = pattern;
            }

            if (selector === '*') {
                patterns.push({ level, priority: 0 });
                return;
            }

            const [type, ...rest] = selector.split(':');
            if (!type || rest.length === 0) return;

            const name = rest.join(':');
            
            switch (type.trim()) {
                case 'mod':
                    const [module, component] = name.split('/');
                    patterns.push({
                        module: module.trim(),
                        component: component?.trim(),
                        level,
                        priority: component ? 3 : 2
                    });
                    break;
                case 'comp':
                    patterns.push({
                        component: name.trim(),
                        level,
                        priority: 1
                    });
                    break;
                case 'tag':
                    patterns.push({
                        tags: [name.trim()],
                        level,
                        priority: 1
                    });
                    break;
            }
        });

        Logger.patterns = patterns;
    }

    private getEffectiveLevel(bindings: LogContext, runtimeTags?: string[]): LogLevel {
        // No patterns, use current level
        if (Logger.patterns.length === 0) {
            return this.currentLevel;
        }

        // Sort patterns by priority (highest first)
        const sortedPatterns = [...Logger.patterns].sort((a, b) => b.priority - a.priority);

        // Combine static tags from bindings and runtime tags
        const allTags = new Set([
            ...(bindings.tags || []),
            ...(runtimeTags || [])
        ]);

        for (const pattern of sortedPatterns) {
            // Module/Component exact match
            if (pattern.module && pattern.component) {
                if (bindings.module === pattern.module && bindings.component === pattern.component) {
                    return pattern.level;
                }
                continue;
            }

            // Module match
            if (pattern.module && bindings.module === pattern.module) {
                return pattern.level;
            }

            // Component match
            if (pattern.component && bindings.component === pattern.component) {
                return pattern.level;
            }

            // Tag match - now checks both static and runtime tags
            if (pattern.tags && allTags.size > 0) {
                if (pattern.tags.some(tag => allTags.has(tag))) {
                    return pattern.level;
                }
            }

            // Wildcard match
            if (!pattern.module && !pattern.component && !pattern.tags) {
                return pattern.level;
            }
        }

        return this.currentLevel;
    }

    /**
     * Create a logger with additional context that will be included in all log messages
     * @param bindings Contextual information like module name, component, tags
     * @returns A new Logger instance with the specified context
     * @example
     * const memoryLogger = logger.withContext({ module: 'memory' });
     * const authLogger = logger.withContext({ module: 'auth', tags: ['security'] });
     */
    public withContext(bindings: LogContext): Logger {
        const contextLogger = new Logger();
        contextLogger.currentOptions = this.currentOptions;
        contextLogger.bindings = bindings;
        
        // Determine effective log level
        const effectiveLevel = this.getEffectiveLevel(bindings);
        contextLogger.currentLevel = effectiveLevel;
        
        // Create pino logger with context and level
        contextLogger.logger = this.logger.child({
            ...bindings,
            level: effectiveLevel
        });

        // Track this context logger
        Logger.contextLoggers.add(contextLogger);
        
        return contextLogger;
    }

    private createLogger(level: LogLevel): pino.Logger {
        const transports = [];

        // Always add pretty print transport for console
        transports.push({
            target: 'pino-pretty',
            options: {
                ...this.currentOptions,
                messageFormat: '{msg}',
                customLevels: {
                    [LogLevel.TRACE]: 10,
                    [LogLevel.DEBUG]: 20,
                    [LogLevel.INFO]: 30,
                    [LogLevel.WARN]: 40,
                    [LogLevel.ERROR]: 50,
                    [LogLevel.FATAL]: 60
                },
                customLevelsPath: 'effectiveLevel', // Look at this field for level filtering
            }
        });

        // If we're in Tauri environment, add Tauri transport
        if (this.runtime.runtimeType === RuntimeType.TAURI) {
            transports.push(tauriTransport);
        }

        // Always use trace as root level to allow all logs through
        return pino({
            level: LogLevel.TRACE,
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

        // Update all context loggers to use the new root logger
        Logger.contextLoggers.forEach(contextLogger => {
            contextLogger.currentOptions = this.currentOptions;
            if (contextLogger.bindings) {
                contextLogger.logger = this.logger.child({
                    ...contextLogger.bindings,
                    level: contextLogger.currentLevel
                });
            }
        });
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

    private formatMessage(message: string, args: any[]): LogData {
        // Extract tags from args if present
        const tags: string[] = [];
        const processedArgs = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                const { tags: argTags, ...rest } = arg;
                if (Array.isArray(argTags)) {
                    tags.push(...argTags);
                    return rest;
                }
            }
            return arg;
        });

        return {
            msg: message,
            ...(processedArgs.length > 0 && { data: this.formatArgs(processedArgs) }),
            ...(tags.length > 0 && { tags })
        };
    }

    private parseLogLevel(level: string): LogLevel | null {
        return Logger.parseLogLevel(level);
    }

    public static parseLogLevel(level: string): LogLevel {
        level = level.toLowerCase().trim();
        switch (level) {
            case 'trace': return LogLevel.TRACE;
            case 'debug': return LogLevel.DEBUG;
            case 'info': return LogLevel.INFO;
            case 'warn': return LogLevel.WARN;
            case 'error': return LogLevel.ERROR;
            case 'fatal': return LogLevel.FATAL;
            default: return LogLevel.INFO;  // Default to INFO for external usage
        }
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

    private log(level: LogLevel, message: string, ...args: any[]) {
        const logData = this.formatMessage(message, args);
        const effectiveLevel = this.getEffectiveLevel(this.bindings || { module: 'unknown' }, logData.tags);
        
        const logLevels = {
            [LogLevel.TRACE]: 10,
            [LogLevel.DEBUG]: 20,
            [LogLevel.INFO]: 30,
            [LogLevel.WARN]: 40,
            [LogLevel.ERROR]: 50,
            [LogLevel.FATAL]: 60
        };

        // Only log if effective level allows it
        if (logLevels[effectiveLevel] <= logLevels[level]) {
            this.logger[level]({ 
                ...logData,
                effectiveLevel,
                // Include bindings tags in output for consistency
                tags: [...(this.bindings?.tags || []), ...(logData.tags || [])]
            });
        }
    }

    public debug(message: string, ...args: any[]) {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    public info(message: string, ...args: any[]) {
        this.log(LogLevel.INFO, message, ...args);
    }

    public warning(message: string, ...args: any[]) {
        this.log(LogLevel.WARN, message, ...args);
    }

    public warn(message: string, ...args: any[]) {
        this.log(LogLevel.WARN, message, ...args);
    }

    public error(message: string, ...args: any[]) {
        this.log(LogLevel.ERROR, message, ...args);
    }

    public trace(message: string, ...args: any[]) {
        this.log(LogLevel.TRACE, message, ...args);
    }

    public fatal(message: string, ...args: any[]) {
        this.log(LogLevel.FATAL, message, ...args);
    }
}


export class LoggerFactory {
    private static loggers = new Map<string, Logger>();

    static getLogger(context: LogContext): Logger {
        const key = this.getLoggerKey(context);
        if (!this.loggers.has(key)) {
            const logger = Logger.getInstance().withContext(context);
            this.loggers.set(key, logger);
        }
        return this.loggers.get(key)!;
    }

    private static getLoggerKey(context: LogContext): string {
        return `${context.module}:${context.component || '*'}`;
    }
}

// Export a singleton instance
// Example usage:
// Basic logging (backward compatible):
//   logger.info("Message");
//
// Contextual logging:
//   const memoryLogger = logger.withContext({ module: 'memory' });
//   memoryLogger.debug("Operation completed");
//
// With environment variable:
//   DEBUG='mod:memory=debug,mod:memory/storage=trace,tag:security=debug' bun run program.ts
//   const secureLogger = logger.withContext({ module: 'auth', tags: ['security'] });
//   secureLogger.debug("Security check passed");  // Will output if DEBUG includes tag:security=debug

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