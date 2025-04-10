import { McpAgent } from './McpAgent';
import readline from 'readline';
import { LoggingConfig } from "@finogeek/actgent/core";
import { Logger, logger, LogLevel} from '@finogeek/actgent/core'
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
  destination: path.join(process.cwd(), `${McpAgent.getName()}.log`)
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
McpAgent.run(loggerConfig);
McpAgent.registerStreamCallback((delta: string) => {
    process.stdout.write(delta);
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
            console.log("Thank you for using the McpAgent. Goodbye!");
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
        console.log("event");
        if (typeof response === 'string') {
            process.stdout.write(`\n${McpAgent.getName()}: `);
            process.stdout.write("Structured output to be handled by a tool:\n");
            process.stdout.write(JSON.stringify(response, null, 2));
            process.stdout.write(`\n\n${defaultPrompt}`);
        } else if (typeof response === 'object') {
            if ('clarification' in response) {
                const { questions } = response.clarification;
                if (questions) {
                    console.log(`${McpAgent.getName()}: ${questions.join('\n')}`);
                }
            } else if ('confirmation' in response) {
                const { prompt, options } = response.confirmation;
                if (prompt) {
                    console.log(`${McpAgent.getName()}: ${prompt}`);
                    if (options) {
                        console.log(`Options: ${options.join(', ')}`);
                    }
                }
            } else if ('exception' in response) {
                const { reason, suggestedAction } = response.exception;
                if (reason) {
                    console.log(`${McpAgent.getName()} Error: ${reason}`);
                    if (suggestedAction) {
                        console.log(`Suggestion: ${suggestedAction}`);
                    }
                }
            } else {
                process.stdout.write(`\n${McpAgent.getName()}: `);
                process.stdout.write("Structured output to be handled by a tool:\n");
                process.stdout.write(JSON.stringify(response, null, 2));
                process.stdout.write(`\n\n${defaultPrompt}`);
            }
        }
    });

    session.onException((response: any) => {
        console.log(`${McpAgent.getName()} Error:`, JSON.stringify(response, null, 2));
    });

    session.onConversation((response: any) => {
        process.stdout.write(`\n${McpAgent.getName()}: `);
        if (typeof response === 'string') {
            // Display string responses directly
            process.stdout.write(response);
        } else if (response && typeof response === 'object') {
            // If it's an object with content property (common MCP response format)
            if (response.content) {
                if (Array.isArray(response.content)) {
                    // Handle MCP standard content array format
                    for (const item of response.content) {
                        if (item.type === 'text' && item.text) {
                            process.stdout.write(item.text);
                        } else if (item.type === 'image' && item.data) {
                            process.stdout.write(`[Image data available]`);
                        } else {
                            process.stdout.write(JSON.stringify(item, null, 2));
                        }
                    }
                } else if (typeof response.content === 'string') {
                    process.stdout.write(response.content);
                } else {
                    process.stdout.write(JSON.stringify(response.content, null, 2));
                }
            } else {
                // Fall back to JSON stringification for other object formats
                process.stdout.write(JSON.stringify(response, null, 2));
            }
        } else if (response === null || response === undefined) {
            // Handle empty responses
            process.stdout.write("I processed your request but don't have additional information to provide.");
        } else {
            // Handle any other type of response
            process.stdout.write(String(response));
        }
        process.stdout.write(`\n\n${defaultPrompt}`);
    });
}

// Handle ongoing chat
async function handleChat(session: any): Promise<void> {
    while (true) {
        const userInput = await new Promise<string>((resolve) => {
            askQuestion("", resolve);
        });

        if (userInput.toLowerCase().trim() === '/exit') {
            console.log("Thank you for using the McpAgent. Shutting down...");
            await McpAgent.shutdown();
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
        console.log("~~~ Welcome to the McpAgent ~~~");
        console.log("Type '/exit' to end the conversation.");

        const initialInput = await handleInitialInput();
        const session = await McpAgent.createSession("user", initialInput);
        
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