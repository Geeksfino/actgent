import fs from 'fs/promises';
import path from 'path';
import { Instruction } from '../../../core/configs';
import { createRuntime } from '../../../runtime';
import { AgentCoreConfigurator } from '../../AgentCoreConfigurator';

const runtime = createRuntime();

export interface AgentSerializeResult {
    agent_name: string;
    role: string;
    goal: string;
    capabilities: string;
    instructions: Instruction[];
    tools: string[];
}

async function extractInstructions(instructionsDir: string, brainPath: string): Promise<Instruction[]> {
    const config = await AgentCoreConfigurator.loadMarkdownConfig(brainPath);
    return config.instructions || [];
}

async function extractAgentConfig(brainPath: string): Promise<{
    role: string;
    goal: string;
    capabilities: string;
}> {
    const config = await AgentCoreConfigurator.loadMarkdownConfig(brainPath);
    return {
        role: config.role || '',
        goal: config.goal || '',
        capabilities: config.capabilities || ''
    };
}

async function extractTools(indexPath: string): Promise<string[]> {
    const content = await fs.readFile(indexPath, 'utf-8');
    const tools: string[] = [];
    
    // Extract tool imports
    const importLines = content.match(/import\s*{\s*([^}]+)}\s*from\s*["']@finogeeks\/actgent\/tools["']/);
    if (importLines && importLines[1]) {
        tools.push(...importLines[1].split(',').map(t => t.trim()));
    }
    
    return tools;
}

export async function serializeAgentScaffold(agentDir: string): Promise<AgentSerializeResult> {
    // Handle tilde expansion
    const homeDir = await runtime.os.homedir();
    agentDir = agentDir.replace(/^~/, homeDir);
    
    const agent_name = path.basename(agentDir);
    console.log(`Serializing agent from directory: ${agentDir}`);
    
    const brainPath = path.join(agentDir, 'brain.md');
    const instructionsDir = path.join(agentDir, 'instructions');
    const indexPath = path.join(agentDir, 'index.ts');

    const config = await extractAgentConfig(brainPath);
    const instructions = await extractInstructions(instructionsDir, brainPath);
    const tools = await extractTools(indexPath);

    return {
        agent_name,
        ...config,
        instructions,
        tools
    };
}

// CLI implementation
async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node scaffold-serializer.js <agent-directory>');
        process.exit(1);
    }

    const [agentDir] = args;
    try {
        const result = await serializeAgentScaffold(agentDir);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error serializing agent scaffold:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
