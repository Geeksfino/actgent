import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Instruction } from '../../../core/configs';

export interface AgentScaffoldOptions {
    name: string;
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
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function generateAgentScaffold({ name, role, goal, capabilities, instructions, tools = [], outputDir }: AgentScaffoldOptions) {
    // Handle tilde expansion
    outputDir = outputDir.replace(/^~/, os.homedir());
    console.log(`Scaffold output directory: ${outputDir}`);
    console.log(`Scaffold agent name: ${name}`);
    const agentDir = path.join(outputDir, name);

    // Create main directory and instructions subdirectory
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'instructions'), { recursive: true });
    await fs.mkdir(path.join(agentDir, 'conf'), { recursive: true });

    // Template paths
    const templatesDir = path.join(__dirname, 'scaffold-template');
    const agentCodeTemplate = path.join(templatesDir, 'agentcode-template.md');
    const runnerTemplate = path.join(templatesDir, 'runner-template.md');
    const configTemplate = path.join(templatesDir, 'brain-template.md');
    const envTemplate = path.join(templatesDir, 'env-template.md');
    const dbConfig = path.join(templatesDir, 'database.yml');
    const instructionsDir = path.join(templatesDir, 'instructions');

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
        `${name}.registerTool(new ${toolName}());`
    ).join('\n');

    const replacements = { 
        name, 
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
        fs.writeFile(path.join(agentDir, `${name}.ts`), agentCode),
        fs.writeFile(path.join(agentDir, 'brain.md'), configMd),
        fs.writeFile(path.join(agentDir, 'index.ts'), indexCode),
        fs.writeFile(path.join(agentDir, '.agent.env'), envContent),
        fs.copyFile(dbConfig, path.join(agentDir, 'conf', 'database.yml')),
    ]);

    // Create instructions directory
    const agentInstructionsDir = path.join(agentDir, 'instructions');
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
            path.join(agentInstructionsDir, `${name}.md`),
            mdContent
        );

        // Create schema JSON file if template exists
        if (schemaTemplate) {
            await fs.writeFile(
                path.join(agentInstructionsDir, `${name}.json`),
                JSON.stringify(schemaTemplate, null, 2)
            );
        }
    }

    // Copy base instructions directory separately
    await copyDirectory(instructionsDir, agentInstructionsDir);

    // After generating instruction files, update brain.md with instructions
    const configPath = path.join(agentDir, 'brain.md');
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

    const [name, role, goal, capabilities, outputDir] = args;
    try {
        const createdDir = await generateAgentScaffold({ name, role, goal, capabilities, instructions: [], tools: [], outputDir });
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
