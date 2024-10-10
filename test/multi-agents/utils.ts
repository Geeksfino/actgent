import { AgentBuilder, AgentServiceConfigurator, ClassificationTypeConfig } from '@finogeeks/actgent';
import path from 'path';
import fs from 'fs';

// Ensure the projects directory exists
export const projectsDir = path.join(__dirname, 'projects');
if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir);
}

// Helper function to create an agent
export function createAgent(name: string, role: string, goal: string, capabilities: string, schemaTypes: ClassificationTypeConfig[]) {
    const coreConfig = { name, role, goal, capabilities };
    const svcConfig = AgentServiceConfigurator.getAgentConfiguration("test/multi-agents");
    const agentBuilder = new AgentBuilder(coreConfig, svcConfig);
    return { agent: agentBuilder.build(name, schemaTypes), name };
}