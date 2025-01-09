import { logger } from '../../src/core/Logger';
import { LogLevel } from '../../src/core/Logger';

// Set log level based on environment variable
const level = process.env.DEBUG === 'true' ? LogLevel.DEBUG : LogLevel.INFO;
logger.setLevel(level);
