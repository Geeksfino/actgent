import { AgentBuilder } from "@finogeek/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator } from "@finogeek/actgent/helpers";
import { MultiLevelClassifier, MultiLevelPromptTemplate } from "@finogeek/actgent/agent";
import { createRuntime } from "@finogeek/actgent/runtime";

const runtime = createRuntime();

// Import tools


// Load the agent configuration from a markdown file
const configPath = runtime.path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration(__dirname);
const HealthcareExpert = new AgentBuilder(agentConfig, svcConfig)
    .create(MultiLevelClassifier, MultiLevelPromptTemplate);

// Register tools


export { HealthcareExpert };