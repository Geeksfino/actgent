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

async function checkScaffoldComplete(agentDir: string): Promise<boolean> {
    const completionMarker = runtime.path.join(agentDir, '.scaffold-complete');
    
    try {
        const markerContent = await fs.readFile(completionMarker, 'utf-8');
        const { timestamp, files } = JSON.parse(markerContent);
        
        // Verify all required files exist
        await Promise.all(
            files.map(async (file: string) => {
                await fs.access(runtime.path.join(agentDir, file));
            })
        );
        
        return true;
    } catch (error) {
        return false;
    }
}

export async function serializeAgentScaffold(agentDir: string): Promise<AgentSerializeResult> {
    // Wait for scaffold completion with timeout
    const maxAttempts = 10;
    const retryDelay = 500; // 500ms
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const isComplete = await checkScaffoldComplete(agentDir);
        
        if (isComplete) {
            const completionMarker = runtime.path.join(agentDir, '.scaffold-complete');
            const markerContent = JSON.parse(await fs.readFile(completionMarker, 'utf-8'));
            
            const brainPath = runtime.path.join(agentDir, 'brain.md');
            const indexPath = runtime.path.join(agentDir, 'index.ts');
            
            // Load the complete config using AgentCoreConfigurator
            const config = await AgentCoreConfigurator.loadMarkdownConfig(brainPath);
            const tools = await extractTools(indexPath);
            
            return {
                agent_name: markerContent.agent_name,
                role: markerContent.role,
                goal: markerContent.goal,
                capabilities: config.capabilities || '',
                instructions: config.instructions || [],
                tools
            };
        }
        
        if (attempt < maxAttempts) {
            logger.debug(`[Scaffold Serializer] Waiting for scaffold completion (attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
            throw new Error('Scaffold generation timeout: Maximum retry attempts exceeded');
        }
    }
    
    throw new Error('Scaffold generation incomplete');
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
