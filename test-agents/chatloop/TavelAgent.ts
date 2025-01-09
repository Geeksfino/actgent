import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator } from "@finogeeks/actgent/helpers";
import { AgentCoreConfigurator } from "@finogeeks/actgent/helpers";
import path from 'path';

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'config.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/chatloop");
const TravelAgent = new AgentBuilder(agentConfig, svcConfig).create();

export { TravelAgent };
