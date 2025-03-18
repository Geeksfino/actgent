import { AgentBuilder } from "@finogeek/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator } from "@finogeek/actgent/helpers";
import { MultiLevelClassifier, MultiLevelPromptTemplate } from "@finogeek/actgent/agent";
import { BarePromptTemplate, BareClassifier } from "@finogeek/actgent/agent";
import { createRuntime } from "@finogeek/actgent/runtime";
import { McpKnowledgePreProcessor } from "./McpKnowledgePreProcessor";

const runtime = createRuntime();

// Import tools


// Load the agent configuration from a markdown file
const configPath = runtime.path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration(__dirname);

const TechSupportAgent = new AgentBuilder(agentConfig, svcConfig)
    .create(BareClassifier, BarePromptTemplate);

// Initialize MCP preprocessor
(async () => {
  try {
    // Create the preprocessor and initialize it
    const preprocessor = new McpKnowledgePreProcessor();
    const initialized = await preprocessor.initialize(
      runtime.path.join(__dirname, 'conf', 'preproc-mcp.json')
    );
    
    if (initialized) {
      // Set the preprocessor on the agent
      TechSupportAgent.setQueryPreProcessor(preprocessor);
      console.log('MCP Knowledge preprocessor initialized and set up with the agent');
    } else {
      console.warn('Failed to initialize MCP Knowledge preprocessor');
    }
  } catch (error) {
    console.error('Error setting up MCP Knowledge preprocessor:', error);
  }
})();

export { TechSupportAgent };