import { ${name} } from './${name}';
import readline from 'readline';
import { LoggingConfig } from "@finogeeks/actgent/core";
import { Logger, logger, LogLevel} from '@finogeeks/actgent/helpers';
import path from "path";
import os from "os";
import { program } from 'commander';

// Configure command line options
program
  .option('--log-level <level>', 'set logging level (DEBUG, INFO, WARNING, ERROR)', 'INFO')
  .parse();

const options = program.opts();

const loggerConfig: LoggingConfig = {
  destination: path.join(process.cwd(), `${name}.getName().log`)
};
logger.setLevel(Logger.parseLogLevel(options.logLevel));

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

${name}.registerStreamCallback((delta: string) => {
    logger.info(delta);
});
${name}.run(loggerConfig);

async function chatLoop() {
    try {
        console.log("Welcome to the ${name}!");
        console.log("Type '/exit' to end the conversation.");

        let input = '';
        do {
            input = await new Promise<string>((resolve) => {
                rl.question('How may I help you today? ', resolve);
            });

            if (input.toLowerCase().trim() === '/exit') {
                console.log("Thank you for using the ${name}. Goodbye!");
                return;
            }

            if (input.trim() === '') {
                console.log("Please input something to continue.");
            }
        } while (input.trim() === '');

        const session = await ${name}.createSession("user", input);

        while (true) {
            const userInput = await new Promise<string>((resolve) => {
                rl.question('You: ', resolve);
            });

            if (userInput.toLowerCase().trim() === '/exit') {
                console.log("Thank you for using the ${name}. Shutting down...");
                await ${name}.shutdown();
                break;
            }

            if (userInput.trim() === '') {
                continue;
            }

            await session.chat(userInput);
        }
    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        rl.close();
        process.exit(0);  // Ensure the process exits after shutdown
    }
}

chatLoop();