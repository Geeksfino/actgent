import { LoggingConfig } from "../../core/configs";
import { AgentSmith } from './AgentSmith';
import { Logger, logger, LogLevel} from '../../helpers/Logger';
import readline from 'readline';
import path from "path";
import os from "os";
import { program } from 'commander';

// Configure command line options
program
  .option('--log-level <level>', 'set logging level (DEBUG, INFO, WARNING, ERROR)', 'INFO')
  .parse();

const options = program.opts();
const loggerConfig: LoggingConfig = {
  destination: path.join(process.cwd(), `${AgentSmith.getName()}.log`)
};
logger.setLevel(Logger.parseLogLevel(options.logLevel));

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

AgentSmith.registerStreamCallback((delta: string) => {
  logger.info(delta);
});

const executionContext = AgentSmith.getExecutionContext();
executionContext.environment = {
  outputDirectory: path.join(process.cwd(), "generated-agents"),
  tempDirectory: path.join(os.tmpdir(), "generated-agents-temp")
};
executionContext.addToolPreference("AgentGenerator", {
  agentName: ''  
});
AgentSmith.run(loggerConfig);

async function chatLoop() {
  try {
    console.log("This is AgentSmith. I am a smith to help you create agents.");
    console.log("Type '/exit' to end the conversation.");

    let description = '';
    let agentName = '';

    // Get agent description
    do {
      description = await new Promise<string>((resolve) => {
        rl.question('What kind of agent do you want to create? ', resolve);
      });

      if (description.trim().toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (description.trim() === '') {
        console.log("Please input something to continue.");
      }
    } while (description.trim() === '');

    // Get agent name
    do {
      agentName = await new Promise<string>((resolve) => {
        rl.question('What would you like to name this agent? ', resolve);
      });

      if (agentName.trim().toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (agentName.trim() === '') {
        console.log("How would you like to name the agent?");
      }
    } while (agentName.trim() === '');
    
    executionContext.addToolPreference("AgentGenerator", {
      agentName: agentName  // Direct object without extra nesting
    });
    // console.log(`Agent description: ${description}`);
    // console.log(`Agent name: ${executionContext.toolPreferences.get("AgentGenerator")?.customOptions?.agentName}`);
    // console.log(`Execution context: ${JSON.stringify(executionContext.toJSON(), null, 2)}`);

    const agentDescription = description + `\n\nThe name of this agent is ${agentName}.`;
    
    // Create session and set up response handler
    const session = await AgentSmith.createSession("user", agentDescription);
    session.onEvent((response) => {
      if (typeof response === 'string') {
        console.log(`${AgentSmith.getName()}:`, response);
      } else {
        console.log(`${AgentSmith.getName()}:`, JSON.stringify(response, null, 2));
      }
    });

    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        rl.question('You: ', resolve);
      });

      if (userInput.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Shutting down...");
        await AgentSmith.shutdown();
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
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

chatLoop();
