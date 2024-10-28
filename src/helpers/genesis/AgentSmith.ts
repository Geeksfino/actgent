import { AgentBuilder } from "../../agent";
import { AgentServiceConfigurator } from "../AgentServiceConfigurator";
import { AgentCoreConfigurator } from "../AgentCoreConfigurator";
import path from 'path';
import { ToolOptions } from "../../core/Tool";
import { AgentGenerator, AgentGeneratorInput, AgentGeneratorOutput } from "./tools/creation-tool";

// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'config.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

const currentDir = process.cwd();
const svcConfig = AgentServiceConfigurator.getAgentConfiguration("src/helpers/genesis");
const AgentSmith = new AgentBuilder(agentConfig, svcConfig).create();

AgentSmith.registerTool(new AgentGenerator());

export { AgentSmith };
