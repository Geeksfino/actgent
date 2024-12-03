import fs from 'fs/promises';
import path from 'path';
import { Instruction } from '../../../core/configs';
import { createRuntime } from '../../../runtime';

const runtime = createRuntime();

export interface AgentSerializeResult {
    agent_name: string;
    role: string;
    goal: string;
    capabilities: string;
    instructions: Instruction[];
    tools: string[];
}

async function readMarkdownFrontMatter(filePath: string): Promise<Record<string, any>> {
    const content = await fs.readFile(filePath, 'utf-8');
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) return {};

    const frontMatter: Record<string, any> = {};
    const lines = frontMatterMatch[1].split('\n');
    for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
            frontMatter[key.trim()] = valueParts.join(':').trim();
        }
    }
    return frontMatter;
}

async function extractInstructions(instructionsDir: string): Promise<Instruction[]> {
    const instructions: Instruction[] = [];
    const files = await fs.readdir(instructionsDir);
    
    for (const file of files) {
        if (file.endsWith('.md')) {
            const filePath = path.join(instructionsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const frontMatter = await readMarkdownFrontMatter(filePath);
            const description = content.split('---\n')[2]?.trim() || '';
            
            // Try to read corresponding JSON schema if it exists
            const schemaPath = path.join(instructionsDir, `${path.parse(file).name}.json`);
            let schemaTemplate;
            try {
                const schemaContent = await fs.readFile(schemaPath, 'utf-8');
                schemaTemplate = JSON.parse(schemaContent);
            } catch {
                schemaTemplate = undefined;
            }

            instructions.push({
                name: frontMatter.instructionName || path.parse(file).name,
                description,
                schemaTemplate
            });
        }
    }
    return instructions;
}

async function extractAgentConfig(brainPath: string): Promise<{
    role: string;
    goal: string;
    capabilities: string;
}> {
    const content = await fs.readFile(brainPath, 'utf-8');
    const lines = content.split('\n');
    
    const config = {
        role: '',
        goal: '',
        capabilities: ''
    };

    for (const line of lines) {
        if (line.startsWith('role:')) {
            config.role = line.substring(5).trim();
        } else if (line.startsWith('goal:')) {
            config.goal = line.substring(5).trim();
        } else if (line.startsWith('capabilities:')) {
            config.capabilities = line.substring(13).trim();
        }
    }

    return config;
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
    
    // Extract instructions
    const instructionsDir = path.join(agentDir, 'instructions');
    const instructions = await extractInstructions(instructionsDir);
    
    // Extract agent configuration from brain.md
    const brainPath = path.join(agentDir, 'brain.md');
    const config = await extractAgentConfig(brainPath);
    
    // Extract tools from index.ts
    const indexPath = path.join(agentDir, 'index.ts');
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
