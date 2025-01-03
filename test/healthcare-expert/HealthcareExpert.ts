import { AgentBuilder } from "@finogeeks/actgent/agent";
import { AgentServiceConfigurator, AgentCoreConfigurator } from "@finogeeks/actgent/helpers";
import { MultiLevelClassifier, MultiLevelPromptTemplate } from "@finogeeks/actgent/agent";
import { ClassificationTypeConfig } from "@finogeeks/actgent/core";
import path from 'path';

// Import tools


// Load the agent configuration from a markdown file
const configPath = path.join(__dirname, 'brain.md');
const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

// Load the agent runtime environment from the project root
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration(__dirname);
const HealthcareExpert = new AgentBuilder(agentConfig, svcConfig)
    .create(MultiLevelClassifier, MultiLevelPromptTemplate);

// Register tools


export { HealthcareExpert };