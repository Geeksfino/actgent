import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator } from "@finogeeks/actgent/helpers";
import { MultiLevelClassifier, MultiLevelPromptTemplate } from "@finogeeks/actgent/agent";
import { BarePromptTemplate, BareClassifier } from "@finogeeks/actgent/agent";
import { createRuntime } from "@finogeeks/actgent/runtime";

const runtime = createRuntime();

// Import tools


// Load the agent configuration from a markdown file
const configPath = runtime.path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration(__dirname);

// Path to MCP configuration file
const mcpConfigPath = runtime.path.join(__dirname, 'conf', 'mcp_config.json');

const TechSupportAgent = new AgentBuilder(agentConfig, svcConfig)
    .withMcpTools(mcpConfigPath)
    .create(MultiLevelClassifier, MultiLevelPromptTemplate);


export { TechSupportAgent };