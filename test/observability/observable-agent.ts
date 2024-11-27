import { AgentCoreConfig, LoggingConfig } from '../../src/core/configs';
import { AgentServiceConfigurator } from '../../src/helpers/AgentServiceConfigurator';
import { AgentBuilder } from '../../src/agent';
import { program } from 'commander';
import { logger, LogLevel } from '../../src/core/Logger';
import { getEventEmitter } from '../../src/core/observability/AgentEventEmitter';
import { AgentEvent } from '../../src/core/observability/event_validation';
import chalk from 'chalk';
import { ReActModeStrategy, KeywordBasedStrategy, UserPreferenceStrategy, AutoSwitchingStrategy } from '../../src/agent/ReActModeStrategy';

// Configure command line options
program
  .option('-l, --local', 'run in local mode (no HTTP server)')
  .option('--log-level <level>', 'set logging level (trace, debug, info, warn, error, fatal)', 'info')
  .option('-n, --network', 'enable network mode with HTTP and streaming servers', false)
  .option('--http-port <port>', 'HTTP server port (network mode only)', '5678')
  .option('--stream-port <port>', 'streaming server port (network mode only)', '5679')
  .option('--description <text>', 'Input description for local mode')
  .option('--strategy <type>', 'Strategy type (auto, keyword, preference)', 'auto')
  .option('--mode <mode>', 'Mode for preference strategy (react/direct), required when strategy=preference', 'direct')
  .option('--trace-events', 'Show all events in trace mode', false)
  .option('--preferred-mode <mode>', 'Preferred mode for UserPreferenceStrategy (react/direct)', 'react');

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}

program.parse();
const options = program.opts();

// Validate strategy and mode combination
if (options.strategy === 'preference' && !['react', 'direct'].includes(options.mode)) {
  console.error(chalk.red('Error: When using preference strategy, --mode must be either "react" or "direct"'));
  process.exit(1);
}

// Configure logging
logger.setLevel(options.logLevel?.toLowerCase() as LogLevel || 'info');

// Configure event monitoring with pretty printing
const monitorEvents = () => {
  const emitter = getEventEmitter();
  
  // Store listeners in a more permanent way
  if (!global.__eventListenersInitialized) {
    console.log('[OBSERVABILITY] Initializing event monitoring');
    
    // Register event listeners
    const eventTypes = ['STRATEGY_SELECTION', 'STRATEGY_SWITCH', 'LLM_RESPONSE'];
    
    eventTypes.forEach(type => {
      const upperType = type.toUpperCase();
      
      // Register basic strategy listener
      emitter.on(upperType, (event) => {
        console.log(chalk.green(`[OBSERVABILITY] Received ${upperType} event:`), JSON.stringify(event, null, 2));
      });
    });

    global.__eventListenersInitialized = true;
  }

  return emitter;
};

const coreConfig: AgentCoreConfig = {
  name: "ObservableAgent",
  role: "Software Architect",
  goal: 'Design and implement a software architecture that meets the business requirements',
  capabilities: 'High-level system design, technology stack selection, scalability planning, security architecture, performance optimization, integration design, cloud architecture, microservices design',
};

// Configure the agent with the specified strategy
const configureStrategy = (type: string) => {
  switch (type.toLowerCase()) {
    case 'keyword':
      return new KeywordBasedStrategy();
    case 'preference':
      return new UserPreferenceStrategy(options.mode as 'react' | 'direct');
    case 'auto':
    default:
      return new AutoSwitchingStrategy();
  }
};

async function main() {
  
  const strategy = configureStrategy(options.strategy);
  const schemaTypes = [
    {
      name: "SIMPLE_QUERY",
      description: "A straightforward question that can be answered directly.",
      schema: {
        answer: "<DIRECT_ANSWER_TO_QUERY>",
      },
    },
    {
      name: "COMPLEX_TASK",
      description: "A task that requires multiple steps or extended processing.",
      schema: {
        actionPlan: {
          task: "<MAIN_OBJECTIVE>",
          subtasks: ["<SUBTASK_1>", "<SUBTASK_2>", "..."],
        },
      },
    },
    {
      name: "CLARIFICATION_NEEDED",
      description: "The message needs clarification.",
      schema: {
        questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
      },
    },
    {
      name: "COMMAND",
      description: "An instruction to perform a specific action.",
      schema: {
        command: {
          action: "<SPECIFIC_ACTION>",
          parameters: {
            "<PARAM_1>": "<VALUE_1>",
            "<PARAM_2>": "<VALUE_2>",
            "...": "...",
          },
          expectedOutcome: "<DESCRIPTION_OF_EXPECTED_RESULT>",
        },
      },
    },
  ] as const;

  const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("test/observability");
  
  // Configure communication settings for network mode
  if (options.network) {
    svcConfig.communicationConfig = {
      ...svcConfig.communicationConfig,
      host: 'localhost',
      httpPort: Number(options.httpPort),
      streamPort: Number(options.streamPort),
      enableStreaming: true  // Enable streaming in network mode
    };
  }
  
  // Configure strategy
  const loggingConfig: LoggingConfig = {
    level: (options.logLevel?.toLowerCase() as 'debug' | 'info' | 'warn' | 'error') || 'info',
    type: 'console',
    destination: 'console'
  };

  const agent = await new AgentBuilder(coreConfig, svcConfig)
    .withPromptStrategy(strategy)
    .withStreamObservability()
    .build("ObservableAgent", [...schemaTypes]);
  
  if (!options.network) {
    agent.registerStreamCallback((delta: string) => {
      process.stdout.write(delta);
    });
  }
    
  const emitter = monitorEvents();
  console.log("running agent");
  await agent.run(loggingConfig);

  if (options.network) {
    console.log(chalk.green(`
Agent started in network mode:
- HTTP server: http://localhost:${options.httpPort}
- Stream server: http://localhost:${options.streamPort}
- Strategy: ${options.strategy}
- Event tracing: ${options.traceEvents ? 'enabled' : 'disabled'}
    `));
  } else {
    const session = await agent.createSession(
      "test", options.description
    );
    session.onEvent((response) => {
      console.log(chalk.cyan('Agent:'), response);
    });
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await agent.shutdown();
        resolve(null);
      });
    });
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Error:'), error);
    //process.exit(1);
  });
}
