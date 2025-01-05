import { HealthcareExpert } from './HealthcareExpert';
import readline from 'readline';
import { LoggingConfig } from "@finogeeks/actgent/core";
import { Logger, logger, LogLevel} from '@finogeeks/actgent/core'
import path from "path";
import os from "os";
import { program } from 'commander';

// Configure command line options
program
  .option('--log-level <level>', 'set logging level (trace, debug, info, warn, error, fatal)', 'info')
  .parse();

const options = program.opts();
logger.setLevel(options.logLevel.toLowerCase() as LogLevel);

const loggerConfig: LoggingConfig = {
  destination: path.join(process.cwd(), `${HealthcareExpert.getName()}.log`)
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
HealthcareExpert.run(loggerConfig);
HealthcareExpert.registerStreamCallback((delta: string) => {
    logger.info(delta);
});


// Add prompt configuration
const defaultPrompt = "You: ";
const prompt = process.env.AGENT_PROMPT || defaultPrompt;

// Helper function for questions
function askQuestion(question: string, resolve: (answer: string) => void) {
    rl.question(`${question}\n${prompt}`, resolve);
}

// Handle initial user input
async function handleInitialInput(): Promise<string> {
    let input = '';
    do {
        input = await new Promise<string>((resolve) => {
            askQuestion("How may I help you today?", resolve);
        });

        if (input.toLowerCase().trim() === '/exit') {
            console.log("Thank you for using the HealthcareExpert. Goodbye!");
            process.exit(0);
        }

        if (input.trim() === '') {
            console.log("Please input something to continue.");
        }
    } while (input.trim() === '');
    
    return input;
}

// Handle chat responses
function setupResponseHandler(session: any) {
    session.onEvent((response: any) => {
        if (typeof response === 'string') {
            console.log(`\n${HealthcareExpert.getName()}:`, response);
        } else if (typeof response === 'object') {
            if ('clarification' in response) {
                const { questions } = response.clarification;
                if (questions) {
                    console.log(`${HealthcareExpert.getName()}: ${questions.join('\n')}`);
                }
            } else if ('confirmation' in response) {
                const { prompt, options } = response.confirmation;
                if (prompt) {
                    console.log(`${HealthcareExpert.getName()}: ${prompt}`);
                    if (options) {
                        console.log(`Options: ${options.join(', ')}`);
                    }
                }
            } else if ('exception' in response) {
                const { reason, suggestedAction } = response.exception;
                if (reason) {
                    console.log(`${HealthcareExpert.getName()} Error: ${reason}`);
                    if (suggestedAction) {
                        console.log(`Suggestion: ${suggestedAction}`);
                    }
                }
            } else {
                console.log(`${HealthcareExpert.getName()}:`, JSON.stringify(response, null, 2));
            }
        }
    });

    session.onException((response: any) => {
        console.log(`${HealthcareExpert.getName()} Error:`, JSON.stringify(response, null, 2));
    });

    session.onConversation((response: any) => {
        process.stdout.write(`\n${HealthcareExpert.getName()}:`);
        process.stdout.write(JSON.stringify(response, null, 2));
        process.stdout.write("\n\nYou: ");
    });
}

// Handle ongoing chat
async function handleChat(session: any): Promise<void> {
    while (true) {
        const userInput = await new Promise<string>((resolve) => {
            askQuestion("", resolve);
        });

        if (userInput.toLowerCase().trim() === '/exit') {
            console.log("Thank you for using the HealthcareExpert. Shutting down...");
            await HealthcareExpert.shutdown();
            break;
        }

        if (userInput.trim() === '') {
            continue;
        }

        try {
            await session.chat(userInput);
        } catch (error) {
            console.error("Error during chat:", error);
        }
    }
}

// Main chat loop
async function chatLoop(): Promise<void> {
    try {
        console.log("Welcome to the HealthcareExpert!");
        console.log("Type '/exit' to end the conversation.");

        const initialInput = await handleInitialInput();
        const session = await HealthcareExpert.createSession("user", initialInput);
        
        setupResponseHandler(session);
        await handleChat(session);
        
    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        rl.close();
        process.exit(0);
    }
}

chatLoop();