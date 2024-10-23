import { AgentBuilder } from "../../agent";
import { AgentServiceConfigurator } from "../AgentServiceConfigurator";
import { AgentCoreConfigurator } from "../AgentCoreConfigurator";
import path from 'path';

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'config.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

const currentDir = process.cwd();
const svcConfig = AgentServiceConfigurator.getAgentConfiguration("src/helpers/agentsmith");
const AgentSmith = new AgentBuilder(agentConfig, svcConfig).create();

export { AgentSmith };
