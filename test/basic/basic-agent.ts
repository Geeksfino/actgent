import { AgentCoreConfig, LoggingConfig } from '../../src/core/configs';
import { AgentServiceConfigurator } from '../../src/helpers/AgentServiceConfigurator';
import { AgentBuilder } from '../../src/agent/AgentBuilder';
import { program } from 'commander';
import { logger, LogLevel } from '../../src/core/Logger';
import { 
  ReActClassifier,
  DefaultPromptTemplate,
  SimpleClassifier,
  SimplePromptTemplate,
  BareClassifier,
  BarePromptTemplate
} from '../../src/agent';

// Performance measurement class
class PerformanceMetrics {
  private startTime: number = 0;
  private checkpoints: Map<string, number> = new Map();
  private implementation: string;
  private tokenCount: number = 0;

  constructor(implementation: string) {
    this.implementation = implementation;
  }

  start() {
    this.startTime = performance.now();
    this.checkpoint('start');
  }

  checkpoint(name: string) {
    this.checkpoints.set(name, performance.now());
  }

  incrementTokenCount(count: number = 1) {
    this.tokenCount += count;
  }

  end() {
    this.checkpoint('end');
    this.printMetrics();
  }

  private printMetrics() {
    console.log('\nPerformance Metrics for', this.implementation);
    console.log('----------------------------------------');
    console.log(`Total Tokens: ${this.tokenCount}`);
    
    let previousTime = this.startTime;
    for (const [name, time] of this.checkpoints) {
      if (name === 'start') continue;
      
      const duration = time - previousTime;
      const totalDuration = time - this.startTime;
      console.log(`${name}:`);
      console.log(`  Step Duration: ${duration.toFixed(2)}ms`);
      console.log(`  Total Time: ${totalDuration.toFixed(2)}ms`);
      previousTime = time;
    }
  }
}

// Configure command line options
program
  .option('-l, --local', 'run in local mode (no HTTP server)')
  .option('--log-level <level>', 'set logging level (trace, debug, info, warn, error, fatal)', 'info')
  .option('-n, --network', 'enable network mode with HTTP and streaming servers', false)
  .option('--http-port <port>', 'HTTP server port (network mode only)', '5678')
  .option('--stream-port <port>', 'streaming server port (network mode only)', '5679')
  .option('--description <text>', 'Input description for local mode')
  .option('--event-source', 'Use EventSource-based implementation for streaming')
  .option('--use-simple', 'Use Simple implementation instead of ReAct', false)
  .option('--use-bare', 'Use Bare implementation instead of ReAct', false);

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}

program.parse();
const options = program.opts();

// Configure logging
logger.setLevel(options.logLevel?.toLowerCase() as LogLevel || 'info');

const coreConfig: AgentCoreConfig = {
  name: "TestAgent",
  role: "Software Product Manager",
  goal: 'Create software specification',
  capabilities: 'assist in testing',
};

// Define service config with networking enabled
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("test/basic");

// Configure communication based on mode
if (options.network) {
  console.log("Running in network mode with HTTP streaming enabled");
  // In network mode, we enable HTTP streaming but LLM streaming is controlled by LLM_STREAM_MODE
  svcConfig.communicationConfig = {
    ...svcConfig.communicationConfig,
    httpPort: parseInt(options.httpPort),
    streamPort: parseInt(options.streamPort),
    enableStreaming: true  // Enable HTTP streaming for network mode
  };
} else {
  // In local mode, we disable HTTP/network features but LLM streaming is still controlled by LLM_STREAM_MODE
  if (!options.description) {
    console.error("Error: --description is required in local mode");
    process.exit(1);
  }
  console.log("Running in local mode (no network services)");
  svcConfig.communicationConfig = {
    ...svcConfig.communicationConfig,
    httpPort: undefined,
    streamPort: undefined,
    enableStreaming: false  // Disable HTTP streaming in local mode
  };
}

// Log the final configuration showing both LLM and HTTP streaming states
console.log("Service config:", JSON.stringify({
  ...svcConfig,
  llmConfig: {
    ...svcConfig.llmConfig,
    apiKey: '***'  // Mask API key in logs
  }
}, null, 2));

// Define the schema types
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

async function main() {
  try {
    // Use AgentBuilder to create the agent
    const agentBuilder = new AgentBuilder(coreConfig, svcConfig);

    // Initialize performance metrics
    const metrics = new PerformanceMetrics(options.useBare ? 'Bare' : (options.useSimple ? 'Simple' : 'ReAct'));

    // Create agent based on implementation choice
    const testAgent = options.useBare 
      ? agentBuilder.build(
          "TestAgent", 
          [...schemaTypes], 
          BareClassifier,
          BarePromptTemplate
        )
      : options.useSimple 
        ? agentBuilder.build(
            "TestAgent", 
            [...schemaTypes], 
            SimpleClassifier,
            SimplePromptTemplate
          )
        : agentBuilder.build(
            "TestAgent", 
            [...schemaTypes], 
            ReActClassifier,
            DefaultPromptTemplate
          );

    metrics.checkpoint('agent_created');

    // Set up logging configuration for console output with debug level
    const loggingConfig: LoggingConfig = {
      type: 'console',
    };

    // Register stream callback in local mode
    if (!options.network) {
      let responseStarted = false;
      let lastResponseTime = 0;
      let responseEndTimeout: ReturnType<typeof setTimeout>;

      testAgent.registerStreamCallback((delta: string, control?: { type: 'completion', reason: string }) => {
        if (!responseStarted) {
          metrics.checkpoint('first_token');
          responseStarted = true;
        }

        // Increment token count
        metrics.incrementTokenCount(delta.split(' ').length);

        // Update last response time
        lastResponseTime = Date.now();

        // Clear existing timeout if any
        if (responseEndTimeout) {
          clearTimeout(responseEndTimeout);
        }

        // Set a new timeout to detect end of stream
        responseEndTimeout = setTimeout(() => {
          metrics.checkpoint('stream_completed');
          metrics.end();
        }, 1000); // Wait 1 second after last token to consider stream complete

        process.stdout.write(delta);

        // If we receive a completion control message, mark stream as completed
        if (control?.type === 'completion') {
          metrics.checkpoint('stream_completed');
          metrics.end();
        }
      });
    }

    // Start the agent with the logging config
    await testAgent.run(loggingConfig);
    metrics.checkpoint('agent_started');

    // Handle local mode
    if (!options.network) {
      // Create session with command line description
      const startTime = Date.now();
      const session = await testAgent.createSession("test", options.description);
      metrics.checkpoint('session_created');

      // Listen for the first token
      session.onConversation((message) => {
        const firstTokenTime = Date.now();
        const duration = firstTokenTime - startTime;
        console.log(`Time to first token: ${duration} ms`);
        // Unregister the handler after the first token is received
        session.onConversation(() => {});
      });

      metrics.start();
    } else {
      // Start monitoring the stream first and keep it alive
      console.log(`Agent started and listening on:`);
      console.log(`- HTTP: http://localhost:${svcConfig.communicationConfig?.httpPort}`);
      if (svcConfig.communicationConfig?.enableStreaming) {
        console.log(`- Streaming: http://localhost:${svcConfig.communicationConfig?.streamPort}`);
      }

      metrics.checkpoint('server_started');
      metrics.end();
    }

    // Keep the process alive
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await testAgent.shutdown();
        resolve(null);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
