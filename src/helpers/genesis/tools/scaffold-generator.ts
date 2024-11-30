import fs from 'fs/promises';
import { createRuntime } from '../../../runtime';
import { Instruction } from '../../../core/configs';

const runtime = createRuntime();

export interface AgentScaffoldOptions {
    agent_name: string;
    role: string;
    goal: string;
    capabilities: string;
    instructions: Instruction[];
    tools?: string[];
    outputDir: string;
}

async function loadTemplate(templatePath: string, replacements: Record<string, string>): Promise<string> {
    let content = await fs.readFile(templatePath, 'utf-8');
    
    // Replace all template variables
    Object.entries(replacements).forEach(([key, value]) => {
        content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    });
    
    return content;
}

async function copyDirectory(src: string, dest: string) {
    // Create the destination directory
    await fs.mkdir(dest, { recursive: true });
    
    // Read source directory contents
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    // Copy each entry
    for (const entry of entries) {
        const srcPath = runtime.path.join(src, entry.name);
        const destPath = runtime.path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function generateAgentScaffold({ agent_name, role, goal, capabilities, instructions, tools = [], outputDir }: AgentScaffoldOptions) {
    // Handle tilde expansion
    const homeDir = await runtime.os.homedir();
    outputDir = outputDir.replace(/^~/, homeDir);
    console.log(`Scaffold output directory: ${outputDir}`);
    console.log(`Scaffold agent name: ${agent_name}`);

    // Create the agent directory
    const agentDir = runtime.path.join(outputDir, agent_name);
    await fs.mkdir(agentDir, { recursive: true });

    // Create main directory and instructions subdirectory
    await fs.mkdir(runtime.path.join(agentDir, 'instructions'), { recursive: true });
    await fs.mkdir(runtime.path.join(agentDir, 'conf'), { recursive: true });

    // Template paths
    const templatesDir = runtime.path.join(__dirname, 'scaffold-template');
    const agentCodeTemplate = runtime.path.join(templatesDir, 'agentcode-template.md');
    const runnerTemplate = runtime.path.join(templatesDir, 'runner-template.md');
    const configTemplate = runtime.path.join(templatesDir, 'brain-template.md');
    const envTemplate = runtime.path.join(templatesDir, 'env-template.md');
    const dbConfig = runtime.path.join(templatesDir, 'database.yml');
    const instructionsDir = runtime.path.join(templatesDir, 'instructions');

    // Verify instructions template directory exists
    try {
        await fs.access(instructionsDir);
    } catch (error) {
        throw new Error(`Instructions template directory not found at: ${instructionsDir}`);
    }

    // Generate tool imports and registrations
    const toolImports = tools.map(toolName => 
        `import { ${toolName} } from "@finogeeks/actgent/tools";`
    ).join('\n');

    const toolRegistrations = tools.map(toolName =>
        `${agent_name}.registerTool(new ${toolName}());`
    ).join('\n');

    const replacements = { 
        agent_name, 
        role, 
        goal, 
        capabilities,
        toolImports,
        toolRegistrations 
    };

    // Load and process templates
    const [agentCode, indexCode, configMd, envContent] = await Promise.all([
        loadTemplate(agentCodeTemplate, replacements),
        loadTemplate(runnerTemplate, replacements),
        loadTemplate(configTemplate, replacements),
        loadTemplate(envTemplate, replacements)
    ]);

    // Write files first
    await Promise.all([
        fs.writeFile(runtime.path.join(agentDir, `${agent_name}.ts`), agentCode),
        fs.writeFile(runtime.path.join(agentDir, 'brain.md'), configMd),
        fs.writeFile(runtime.path.join(agentDir, 'index.ts'), indexCode),
        fs.writeFile(runtime.path.join(agentDir, '.agent.env'), envContent),
        fs.copyFile(dbConfig, runtime.path.join(agentDir, 'conf', 'database.yml')),
    ]);

    // Create instructions directory
    const agentInstructionsDir = runtime.path.join(agentDir, 'instructions');
    await fs.mkdir(agentInstructionsDir, { recursive: true });

    // Process each instruction
    for (const instruction of instructions) {
        const { name, description, schemaTemplate } = instruction;
        
        // Create instruction markdown file
        const mdContent = `---
instructionName: ${name}
schemaTemplate: "${name}.json"
---
${description}`;
        await fs.writeFile(
            runtime.path.join(agentInstructionsDir, `${name}.md`),
            mdContent
        );

        // Create schema JSON file if template exists
        if (schemaTemplate) {
            await fs.writeFile(
                runtime.path.join(agentInstructionsDir, `${name}.json`),
                JSON.stringify(schemaTemplate, null, 2)
            );
        }
    }

    // Copy base instructions directory separately
    await copyDirectory(instructionsDir, agentInstructionsDir);

    // After generating instruction files, update brain.md with instructions
    const configPath = runtime.path.join(agentDir, 'brain.md');
    let configContent = await fs.readFile(configPath, 'utf-8');
    
    // Format custom instructions in "name": "path" format with consistent 4-space indentation
    const customInstructionsList = instructions
        .map(instruction => `    "${instruction.name}": "instructions/${instruction.name}.md"`)
        .join('\n');

    // Replace the placeholder with formatted instructions, ensuring consistent indentation
    configContent = configContent.replace(
        /\$\(agent_domain_instructions\)/g,
        customInstructionsList ? `${customInstructionsList}\n` : ''
    );

    // Fix any double indentation issues
    configContent = configContent.replace(/instructions:\n\s+"/g, 'instructions:\n    "');

    await fs.writeFile(configPath, configContent);

    return agentDir;
}

// CLI implementation
async function main() {
    console.log("generating agent scaffold");

    const args = process.argv.slice(2);
    if (args.length !== 6) {
        console.error('Usage: node scaffold-generator.js <agent-name> <role> <goal> <capabilities> <output-directory>');
        process.exit(1);
    }

    const [agent_name, role, goal, capabilities, outputDir] = args;
    try {
        const createdDir = await generateAgentScaffold({ agent_name, role, goal, capabilities, instructions: [], tools: [], outputDir });
        console.log(`Agent scaffold created successfully at: ${createdDir}`);
    } catch (error) {
        console.error('Error creating agent scaffold:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { generateAgentScaffold };
