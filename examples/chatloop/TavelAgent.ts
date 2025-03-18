import { AgentBuilder } from "@finogeek/actgent/agent";
import { AgentServiceConfigurator } from "@finogeek/actgent/helpers";
import { AgentCoreConfigurator } from "@finogeek/actgent/helpers";
import path from 'path';

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'config.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("test/chatloop");
const TravelAgent = new AgentBuilder(agentConfig, svcConfig).create();

export { TravelAgent };
