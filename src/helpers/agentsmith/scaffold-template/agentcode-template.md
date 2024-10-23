
import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator } from "@finogeeks/actgent/helpers";
import { AgentCoreConfigurator } from "@finogeeks/actgent/helpers";
import path from 'path';

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'config.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = AgentServiceConfigurator.getAgentConfiguration("./");
const ${name} = new AgentBuilder(agentConfig, svcConfig).create();

export { ${name} };