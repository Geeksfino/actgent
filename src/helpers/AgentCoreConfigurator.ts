import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { AgentCoreConfig, Instruction } from '../core/interfaces';

export class AgentCoreConfigurator {
  private static  DEFAULT_CONFIG = "config.md";

  public static async loadMarkdownConfig(configPath?: string): Promise<AgentCoreConfig> {
    const currentDir = process.cwd();
    const defaultConfigPath = path.join(currentDir, this.DEFAULT_CONFIG);
    const filePath = configPath || defaultConfigPath;
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse the front matter
    const { data, content } = matter(fileContent);
    
    // Initialize the AgentCoreConfig
    const config: AgentCoreConfig = {
      name: data.name,
      role: data.role,
      goal: data.goal,
      capabilities: data.capabilities,
      instructions: [],
    };

    // Process instructions if present
    if (data.instructions) {
      for (const [name, instructionPath] of Object.entries(data.instructions)) {
        const fullPath = path.join(path.dirname(filePath), instructionPath as string);

        const instructionContent = await fs.readFile(fullPath, 'utf-8');
        const { data, content } = matter(instructionContent);

        let schemaTemplate: string | null = null;
        const schemaTemplatePath = data.schemaTemplate;
        if (schemaTemplatePath) {
          const fullSchemaTemplatePath = path.join(path.dirname(fullPath), schemaTemplatePath as string);

          schemaTemplate = await fs.readFile(fullSchemaTemplatePath, 'utf-8');
          if (!schemaTemplate) {
            throw new Error(`Schema template file ${schemaTemplatePath} not found`);
          } else {
            schemaTemplate = schemaTemplate.trim();
            if (!JSON.parse(schemaTemplate)) {
              throw new Error(`Schema template file ${schemaTemplatePath} is not a valid JSON`);
            }
          }
        }

        const instruction: Instruction = schemaTemplate ? {
          name,
          description: content.trim(),
          schemaTemplate: schemaTemplate
        } : {
          name,
          description: content.trim(),
        };
        
        config.instructions?.push(instruction);
      }
    }

    return config;
  }

  private static parseFrontMatterCaseInsensitive(content: string) {
    const rawFrontMatter = matter(content);
  
    // Convert front-matter keys to lowercase
    const frontMatter: Record<string, any> = {};
    for (const key in rawFrontMatter.data) {
      frontMatter[key.toLowerCase()] = rawFrontMatter.data[key];
    }
  
    return {
      data: rawFrontMatter.data,
      content: rawFrontMatter.content,
    };
  }
}

