import fs from 'fs/promises';
import { Instruction } from '../../../core/configs';
import { createRuntime } from '../../../runtime';
import { AgentCoreConfigurator } from '../../AgentCoreConfigurator';
import { logger } from '../../../core/Logger';

const runtime = createRuntime();

export interface AgentSerializeResult {
    agent_name: string;
    role: string;
    goal: string;
    capabilities: string;
    instructions: Instruction[];
    tools: string[];
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
    const completionMarker = runtime.path.join(agentDir, '.scaffold-complete');
    
    try {
        // Check if scaffold generation is complete
        const markerContent = await fs.readFile(completionMarker, 'utf-8');
        const { timestamp, files } = JSON.parse(markerContent);
        
        // Verify all required files exist
        for (const file of files) {
            await fs.access(runtime.path.join(agentDir, file));
        }
    } catch (error) {
        logger.debug("[Scaffold Serializer] Scaffold generation incomplete:", error);
        throw new Error('Scaffold generation in progress');
    }

    const brainPath = runtime.path.join(agentDir, 'brain.md');
    const indexPath = runtime.path.join(agentDir, 'index.ts');
    
    // Load the complete config using AgentCoreConfigurator
    logger.debug("[Scaffold Serializer]: loading markdowns");
    const config = await AgentCoreConfigurator.loadMarkdownConfig(brainPath);
    logger.debug("[Scaffold Serializer]: Serializing ", config);
    
    // Extract tools from index.ts
    const tools = await extractTools(indexPath);
    
    // Return the complete serialized result
    return {
        agent_name: config.name,
        role: config.role,
        goal: config.goal,
        capabilities: config.capabilities,
        instructions: config.instructions ? config.instructions.map(instruction => ({
            ...instruction,
            schemaTemplate: instruction.schemaTemplate ? JSON.parse(instruction.schemaTemplate) : null
        })) : [],
        tools
    };
}

// CLI implementation
async function main() {
    if (process.argv.length !== 3) {
        console.error('Usage: node scaffold-serializer.js <agent-directory>');
        process.exit(1);
    }

    const agentDir = process.argv[2];
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
