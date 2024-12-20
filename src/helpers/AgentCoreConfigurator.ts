import matter from 'gray-matter';
import { AgentCoreConfig, Instruction } from '../core/configs';
import { logger } from '../core/Logger';
import { createRuntime } from '../runtime';
import { Runtime } from '../runtime/types';

export class AgentCoreConfigurator {
  private static DEFAULT_CONFIG = "config.md";
  private static runtime: Runtime = createRuntime();

  public static async loadMarkdownConfig(configPath?: string): Promise<AgentCoreConfig> {
    const currentDir = await this.runtime.process.cwd();
    const defaultConfigPath = this.runtime.path.join(currentDir, this.DEFAULT_CONFIG);
    const filePath = configPath || defaultConfigPath;
    const fileContent = await this.runtime.fs.readFile(filePath, 'utf-8');
    
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
        const fullPath = this.runtime.path.join(this.runtime.path.dirname(filePath), instructionPath as string);

        const instructionContent = await this.runtime.fs.readFile(fullPath, 'utf-8');
        const { data: instructionData, content } = matter(instructionContent);

        let schemaTemplate: string | undefined = undefined;
        const schemaTemplatePath = instructionData.schemaTemplate;
        if (schemaTemplatePath) {
          try {
            const fullSchemaTemplatePath = this.runtime.path.join(this.runtime.path.dirname(fullPath), schemaTemplatePath as string);
            const rawSchema = await this.runtime.fs.readFile(fullSchemaTemplatePath, 'utf-8');
            
            if (rawSchema) {
              const trimmedSchema = rawSchema.trim();
              try {
                JSON.parse(trimmedSchema); // Validate JSON
                schemaTemplate = trimmedSchema; // Only set if valid
              } catch (e) {
                logger.warning(`[AgentCoreConfigurator] Schema template ${schemaTemplatePath} is not valid JSON, treating instruction as schemaless`);
              }
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              logger.debug(`[AgentCoreConfigurator] Schema template file not found (this is OK): ${schemaTemplatePath}`);
            } else {
              logger.warning(`[AgentCoreConfigurator] Error loading schema template ${schemaTemplatePath}, treating instruction as schemaless`);
            }
          }
        }

        const instruction: Instruction = schemaTemplate ? {
          name,
          description: content.trim(),
          schemaTemplate
        } : {
          name,
          description: content.trim(),
        };
        
        config.instructions?.push(instruction);

        if (instructionData.tool) {
          logger.info(`Instruction "${name}" tool map:`, instructionData.tool);
          config.instructionToolMap = config.instructionToolMap || {};
          config.instructionToolMap[name] = instructionData.tool;
        }
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
