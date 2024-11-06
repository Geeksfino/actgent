import fs from 'fs';
import path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3
}

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

export class Logger {
    private static instance: Logger;
    private logDestination?: string;
    private currentLevel: LogLevel = LogLevel.INFO;

    private constructor() {}

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setDestination(destination?: string) {
        this.logDestination = destination;
        if (destination) {
            const logDir = path.dirname(destination);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    public setLevel(level: LogLevel) {
        this.currentLevel = level;
    }

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        return `${timestamp} [${level}] ${message} ${formattedArgs}`.trim();
    }

    private log(level: LogLevel, levelStr: string, message: string, ...args: any[]) {
        if (level < this.currentLevel) return;

        const logMessage = this.formatMessage(levelStr, message, ...args);

        if (this.logDestination) {
            fs.appendFileSync(this.logDestination, logMessage + '\n');
        } else {
            console.log(logMessage);
        }
    }

    public debug(message: string, ...args: any[]) {
        this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }

    public info(message: string, ...args: any[]) {
        this.log(LogLevel.INFO, 'INFO', message, ...args);
    }

    public warning(message: string, ...args: any[]) {
        this.log(LogLevel.WARNING, 'WARNING', message, ...args);
    }

    public error(message: string, ...args: any[]) {
        this.log(LogLevel.ERROR, 'ERROR', message, ...args);
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