import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface AgentScaffoldOptions {
    name: string;
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

async function generateAgentScaffold({ name, outputDir }: AgentScaffoldOptions) {
    // Handle tilde expansion
    outputDir = outputDir.replace(/^~/, os.homedir());
    const agentDir = path.join(outputDir, name);

    // Create main directory and instructions subdirectory
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(path.join(agentDir, 'instructions'), { recursive: true });

    // Template paths
    const templatesDir = path.join(__dirname, 'scaffold-template');
    const agentCodeTemplate = path.join(templatesDir, 'agentcode-template.md');
    const runnerTemplate = path.join(templatesDir, 'runner-template.md');
    const configTemplate = path.join(templatesDir, 'config-template.md');
    const envTemplate = path.join(templatesDir, 'env-template.md');
    const instructionsDir = path.join(templatesDir, 'instructions');

    // Verify instructions template directory exists
    try {
        await fs.access(instructionsDir);
    } catch (error) {
        throw new Error(`Instructions template directory not found at: ${instructionsDir}`);
    }

    // Load and process templates
    const replacements = { name };
    const [agentCode, indexCode, configMd, envContent] = await Promise.all([
        loadTemplate(agentCodeTemplate, replacements),
        loadTemplate(runnerTemplate, replacements),
        loadTemplate(configTemplate, replacements),
        loadTemplate(envTemplate, replacements)
    ]);

    // Write files first
    await Promise.all([
        fs.writeFile(path.join(agentDir, `${name}.ts`), agentCode),
        fs.writeFile(path.join(agentDir, 'config.md'), configMd),
        fs.writeFile(path.join(agentDir, 'index.ts'), indexCode),
        fs.writeFile(path.join(agentDir, '.agent.env'), envContent),
    ]);

    // Copy instructions directory separately
    await copyDirectory(instructionsDir, path.join(agentDir, 'instructions'));

    return agentDir;
}

// CLI implementation
async function main() {
    console.log("generating agent");

    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node scaffold-generator.js <agent-name> <output-directory>');
        process.exit(1);
    }

    const [name, outputDir] = args;
    try {
        const createdDir = await generateAgentScaffold({ name, outputDir });
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
