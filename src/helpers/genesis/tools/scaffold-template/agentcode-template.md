import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator, KeywordBasedStrategyBuilder } from "@finogeeks/actgent/helpers";
import { AutoSwitchingStrategy, KeywordBasedStrategy, UserPreferenceStrategy } from "../../dist/agent/ReActModeStrategy";
import path from 'path';

// Import tools
${toolImports}

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = AgentServiceConfigurator.getAgentConfiguration("./");
const promptStrategy = await KeywordBasedStrategyBuilder.buildStrategy();
const ${name} = new AgentBuilder(agentConfig, svcConfig)
    .withPromptStrategy(promptStrategy)
    .create();

// Register tools
${toolRegistrations}

export { ${name} };