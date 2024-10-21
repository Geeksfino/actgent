import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { AgentCoreConfig } from '@finogeeks/actgent';
import matter from 'gray-matter';

export class KnowledgeBuilder {
  static createZodSchema(): z.ZodType<AgentCoreConfig, z.ZodTypeDef, {
    name: string;
    role: string;
    goal: string;
    capabilities: string;
    instructions?: Record<string, string>;
  }> {
    return z.object({
      name: z.string(),
      role: z.string(),
      goal: z.string(),
      capabilities: z.string(),
      instructions: z.record(z.string()).optional()
    }).transform(data => ({
      ...data,
      instructions: data.instructions ? new Map(Object.entries(data.instructions)) : undefined
    }));
  }

  static loadAgentConfigFromMarkdown(filePath: string): AgentCoreConfig {
    //console.log("Loading agent config from Markdown file:", filePath);
    try {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const { data: frontMatter, content } = matter(fileContents);
      //console.log(frontMatter);

      // Create schema for AgentCoreConfig
      const schema = this.createZodSchema();

      // Validate the front matter against the schema
      const result = schema.safeParse(frontMatter);

      if (!result.success) {
        console.error('Validation errors:', result.error.issues);
        throw new Error('Invalid configuration: ' + result.error.message);
      }

      const config = result.data;

      // Load instructions if present
      if (config.instructions) {
        const instructionsDir = path.dirname(filePath);

        for (const [key, instructionPath] of config.instructions.entries()) {
          const fullPath = path.join(instructionsDir, instructionPath);
          const instructionContent = fs.readFileSync(fullPath, 'utf8');
          //const prettyPrintedContent = this.prettyPrintMarkdown(instructionContent);
          //console.log(prettyPrintedContent);
          config.instructions.set(key, instructionContent);
        }
      }

      return config;
    } catch (error) {
      console.error(`Error loading agent config from Markdown: ${error}`);
      throw error;
    }
  }

  public static prettyPrintMarkdown(content: string): string {
    const lines = content.split('\n');
    let prettyPrinted = '';
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        prettyPrinted += line + '\n';
      } else if (inCodeBlock) {
        prettyPrinted += line + '\n';
      } else {
        prettyPrinted += line.trim() + '\n';
      }
    }

    return prettyPrinted.trim();
  }
}
