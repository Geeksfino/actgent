import { LoggingConfig } from "../../core/configs";
import { AgentSmith, AvailableTools } from './AgentSmith';
import { Logger, logger, LogLevel} from '../../core/Logger';
import readline from 'readline';
import { createRuntime } from "../../runtime";
import { program } from 'commander';
import { AdminService } from './services/admin-services';

// Configure command line options
const runtime = createRuntime();

program
  .option('--log-level <level>', 'set logging level (trace, debug, info, warn, error, fatal)', 'info')
  .option('--agents-dir <path>', 'directory for generated agents')
  .parse();

const options = program.opts();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

AgentSmith.registerStreamCallback((delta: string) => {
  logger.info(delta);
});

// Initialize asynchronously
async function initializeAgent() {
  const cwd = await runtime.process.cwd();
  const tmpdir = await runtime.os.tmpdir();

  const loggerConfig: LoggingConfig = {
    destination: runtime.path.join(cwd, `${AgentSmith.getName()}.log`)
  };
  logger.setLevel(options.logLevel.toLowerCase() as LogLevel);

  // Determine agents directory - use command line arg if provided, otherwise default
  const agentsDir = options.agentsDir 
    ? runtime.path.resolve(options.agentsDir)  // Resolve to absolute path if provided
    : runtime.path.join(cwd, "generated-agents");
  
  logger.info(`Using agents directory: ${agentsDir}`);

  // Start AdminService with configured agents directory
  const adminService = new AdminService(11370, 'localhost', agentsDir);
  await adminService.start();
  logger.info('AdminService started successfully');

  const executionContext = AgentSmith.getExecutionContext();
  executionContext.environment = {
    outputDirectory: agentsDir,
    tempDirectory: runtime.path.join(tmpdir, "generated-agents-temp")
  };
  executionContext.addToolPreference("AgentGenerator", {
    agentName: ''  
  });
  AgentSmith.run(loggerConfig);

  // Handle cleanup on process exit
  process.on('SIGINT', async () => {
    logger.info('Shutting down AdminService...');
    await adminService.stop();
    process.exit(0);
  });
}

// Add prompt configuration near the top, after other configurations
const defaultPrompt = "You: ";
const prompt = process.env.AGENT_PROMPT || defaultPrompt;

// Add helper function for questions
function askQuestion(question: string, resolve: (answer: string) => void) {
  rl.question(`${question}\n${prompt}`, resolve);
}

// Tool selection related types
interface ToolSelection {
  selectedTools: string[];
  toolConfigs: Map<string, any>;
}

// Tool selection related functions
async function displayAvailableTools(): Promise<void> {
  console.log("\nAvailable tools:");
  console.log("----------------");
  AvailableTools.forEach((tool, index) => {
    console.log(`\n${index + 1}. ${tool.name}`);
    console.log(`   Description: ${tool.description}`);
    
    if (tool.requiresConfig) {
      console.log('   Note: Requires configuration');
    }
  });
  console.log("\n");
}

async function handleToolSelection(): Promise<string[]> {
  const toolsInput = await new Promise<string>((resolve) => {
    askQuestion(
      "Enter tool numbers separated by commas (e.g., 1,3,5), or 'all' for all tools:", 
      resolve
    );
  });
  
  if (toolsInput.toLowerCase().trim() === 'help') {
    await displayToolHelp();
    return handleToolSelection();
  }
  
  if (toolsInput.toLowerCase().trim() === 'all') {
    return AvailableTools
      .filter(tool => !tool.requiresConfig)
      .map(tool => tool.name);
  }
  
  return toolsInput
    .split(',')
    .map(num => num.trim())
    .filter(num => !isNaN(Number(num)) && Number(num) > 0 && Number(num) <= AvailableTools.length)
    .map(num => AvailableTools[Number(num) - 1].name);
}

async function displayToolHelp(): Promise<void> {
  console.log("\nDetailed tool information:");
  AvailableTools.forEach((tool, index) => {
    console.log(`\n${index + 1}. ${tool.name}`);
    console.log(`   Description: ${tool.description}`);
    if (tool.requiresConfig) {
      console.log('   Requires Configuration: Yes');
      if (tool.configSchema) {
        console.log('   Configuration Schema:');
        console.log(JSON.stringify(tool.configSchema.describe(), null, 2));
      }
    }
  });
}

async function handleToolConfiguration(toolName: string): Promise<any | null> {
  const tool = AvailableTools.find(t => t.name === toolName);
  if (!tool?.requiresConfig) return null;

  console.log(`\nTool "${toolName}" requires configuration:`);
  
  if (tool.configExample) {
    console.log('\nExample configuration:');
    console.log(JSON.stringify(tool.configExample, null, 2));
  }
  
  const configInput = await new Promise<string>((resolve) => {
    askQuestion(
      "Please enter the configuration in JSON format (or 'skip' to skip this tool):",
      resolve
    );
  });
  
  if (configInput.toLowerCase() === 'skip') {
    console.log(`Skipped ${toolName}`);
    return null;
  }
  
  try {
    return JSON.parse(configInput);
  } catch (error) {
    console.log(`Invalid configuration for ${toolName}`);
    return null;
  }
}

async function processToolSelections(): Promise<ToolSelection> {
  await displayAvailableTools();
  const selectedTools = await handleToolSelection();
  const toolConfigs = new Map<string, any>();
  
  const finalTools = [];
  
  for (const toolName of selectedTools) {
    const config = await handleToolConfiguration(toolName);
    if (config === null && AvailableTools.find(t => t.name === toolName)?.requiresConfig) {
      continue; // Skip tools that require config but weren't configured
    }
    
    if (config) {
      toolConfigs.set(toolName, config);
    }
    finalTools.push(toolName);
  }
  
  return {
    selectedTools: finalTools,
    toolConfigs
  };
}

// Main chat loop with refactored tool selection
async function chatLoop(): Promise<void> {
  try {
    console.log("This is AgentSmith. I am a smith to help you create agents.");
    console.log(`Current logging level is ${Logger.parseLogLevel(options.logLevel)}`);
    console.log('To change logging level, use --log-level <level> (trace, debug, info, warn, error, fatal)');
    console.log("Type '/exit' to end the conversation.");

    let description = '';
    let agentName = '';
    let isConfirmed = false;

    while (!isConfirmed) {
      // Get agent description
      do {
        description = await new Promise<string>((resolve) => {
          askQuestion("What kind of agent do you want to create?", resolve);
        });

        if (description.trim().toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (description.trim() === '') {
          console.log(`Please input something to continue.\n${prompt}`);
        }
      } while (description.trim() === '');

      // Get agent name
      do {
        agentName = await new Promise<string>((resolve) => {
          askQuestion("What would you like to name this agent?", resolve);
        });

        if (agentName.trim().toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (agentName.trim() === '') {
          console.log(`How would you like to name the agent?\n${prompt}`);
        }
      } while (agentName.trim() === '');
      
      const executionContext = AgentSmith.getExecutionContext();
      executionContext.addToolPreference("AgentGenerator", {
        agentName: agentName
      });

      const agentDescription = description + `\n\nThe name of this agent is ${agentName}.`;
      
      // Count words in the original description
      const wordCount = description.trim().split(/\s+/).length;
      let finalPrompt = agentDescription;

      if (wordCount < 20) {
        const enhanceConfirmation = await new Promise<string>((resolve) => {
          askQuestion("Your description is quite brief. Would you like me to enhance it? (yes/no):", resolve);
        });

        if (enhanceConfirmation.toLowerCase() === '/exit') {
          console.log("Thank you for using AgentSmith. Goodbye!");
          return;
        }

        if (enhanceConfirmation.toLowerCase() === 'yes') {
          finalPrompt = await AgentSmith.enhancePrompt(agentDescription);
          console.log(`Enhanced description: ${finalPrompt}`);
        } else {
          console.log('Proceeding with original description.');
        }
      } else {
        finalPrompt = await AgentSmith.enhancePrompt(agentDescription);
        console.log(`Enhanced description: ${finalPrompt}`);
      }
      
      // Add confirmation step
      const confirmation = await new Promise<string>((resolve) => {
        askQuestion("Would you like to proceed with this agent creation? (yes/no):", resolve);
      });

      if (confirmation.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Goodbye!");
        return;
      }

      if (confirmation.toLowerCase() === 'yes') {
        isConfirmed = true;
        
        const toolQuestion = await new Promise<string>((resolve) => {
          askQuestion("Would you like to add any tools to this agent? (yes/no):", resolve);
        });

        if (toolQuestion.toLowerCase() === 'yes') {
          const { selectedTools, toolConfigs } = await processToolSelections();
          
          if (selectedTools.length > 0) {
            console.log(`\nFinal selected tools: ${selectedTools.join(', ')}`);
            
            // Add tools and their configs to execution context
            executionContext.addToolPreference("AgentGenerator", {
              agentName: agentName,
              tools: selectedTools
            });
            
            // Add individual tool configurations
            toolConfigs.forEach((config, toolName) => {
              executionContext.addToolPreference(toolName, config);
            });
          } else {
            console.log("No tools were selected or configured.");
          }
        }
        
        description = finalPrompt;
      } else if (confirmation.toLowerCase() === 'no') {
        console.log("Let's try again.");
        // Loop will continue and ask for description again
      } else {
        console.log("Please answer 'yes' or 'no'");
      }
    }
    
    // Create session and set up response handler
    const session = await AgentSmith.createSession("user", description);
    session.onEvent((response) => {
      if (typeof response === 'string') {
        console.log(`${AgentSmith.getName()}:`, response);
      } else {
        console.log(`${AgentSmith.getName()}:`, JSON.stringify(response, null, 2));
      }
    });

    while (true) {
      const userInput = await new Promise<string>((resolve) => {
        askQuestion("", resolve);
      });

      if (userInput.toLowerCase() === '/exit') {
        console.log("Thank you for using AgentSmith. Shutting down...");
        try {
          await AgentSmith.shutdown();
          rl.close();
        } catch (error) {
          console.error("Error during shutdown:", error);
        }
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

initializeAgent().then(() => {
  chatLoop();
}).catch(error => {
  console.error('Failed to initialize agent:', error);
  process.exit(1);
});
