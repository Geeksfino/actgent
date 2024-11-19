import 'reflect-metadata'; 
import { AgentBuilder } from "../../agent";
import { AgentServiceConfigurator } from "../AgentServiceConfigurator";
import { AgentCoreConfigurator } from "../AgentCoreConfigurator";
import { Tool, ToolOptions } from "../../core/Tool";
import { AgentGenerator } from "./tools/creation-tool";
import * as BuiltInTools from "../../tools";
import { z } from "zod";
import { createRuntime } from "../../runtime";
import { RuntimeType } from "../../runtime/types";

const runtime = createRuntime();

// Load the agent configuration from a markdown file
let configPath: string;
if (runtime.runtimeType === RuntimeType.NODE) {
  const moduleDir = runtime.path.dirname(require.resolve('./AgentSmith'));
  configPath = runtime.path.join(moduleDir, 'brain.md');
} else {
  // Tauri/browser environment
  const moduleDir = runtime.path.dirname(new URL(import.meta.url).pathname);
  configPath = runtime.path.join(moduleDir, 'brain.md');
}

const agentConfig = await AgentCoreConfigurator.loadMarkdownConfig(configPath);

const currentDir = await runtime.process.cwd();
const svcConfig = await AgentServiceConfigurator.getAgentConfiguration("src/helpers/genesis");
const AgentSmith = new AgentBuilder(agentConfig, svcConfig).create();

// Register the AgentGenerator tool
AgentSmith.registerTool(new AgentGenerator()); 

interface ToolInfo {
    name: string;
    description: string;
    requiresConfig: boolean;
    configExample?: Record<string, any>;
    configSchema?: z.ZodSchema | any;
}

// Define a type for the BuiltInTools module
type ToolsModule = typeof BuiltInTools;
type ToolConstructor = new (...args: any[]) => Tool<any, any>;

function isToolConstructor(value: unknown): value is ToolConstructor {
  return typeof value === 'function' && 
         value.prototype instanceof Tool;
}

function getToolInfo(name: string, ToolClass: ToolConstructor): ToolInfo | null {
  try {
    // Create an instance to get the description
    const instance = new ToolClass();
    
    return {
      name,
      description: instance.description || 'No description available',
      requiresConfig: !!Reflect.getMetadata('requires-config', ToolClass),
      configExample: Reflect.getMetadata('config-example', ToolClass),
      configSchema: (ToolClass as any).configSchema
    };
  } catch (error) {
    // If we can't instantiate (e.g., requires config), try getting description from prototype
    try {
      const description = 
        ToolClass.prototype.description || 
        'No description available';
      
      return {
        name,
        description,
        requiresConfig: true, // If we couldn't instantiate, it probably needs config
        configExample: Reflect.getMetadata('config-example', ToolClass),
        configSchema: (ToolClass as any).configSchema
      };
    } catch (protoError) {
      console.warn(`Could not get info for tool ${name}:`, error);
      return null;
    }
  }
}

function printToolInfo(tools: ToolInfo[]) {
  console.log('\nAvailable Tools:\n');
  
  tools.forEach((tool, index) => {
    // Print basic info
    console.log(`${index + 1}. ${tool.name}`);
    console.log(`   Description: ${tool.description}`);
    
    // Print configuration requirements if any
    if (tool.requiresConfig) {
      console.log('   Requires Configuration: Yes');
      
      if (tool.configExample) {
        console.log('   Example Configuration:');
        console.log('   ' + JSON.stringify(tool.configExample, null, 3)
          .replace(/\n/g, '\n   ')); // Indent the JSON
      }
      
      if (tool.configSchema) {
        console.log('   Schema:');
        // If it's a Zod schema, we can get its shape
        if ('describe' in tool.configSchema) {
          const shape = tool.configSchema.describe();
          console.log('   ' + JSON.stringify(shape, null, 3)
            .replace(/\n/g, '\n   '));
        }
      }
    }
    
    console.log(''); // Empty line between tools
  });
}

// Get available tools
const AvailableTools = Object.entries(BuiltInTools as Record<string, unknown>)
  .filter(([_, value]) => isToolConstructor(value))
  .map(([name, ToolClass]) => getToolInfo(name, ToolClass as ToolConstructor))
  .filter((info): info is ToolInfo => info !== null);

//printToolInfo(AvailableTools);

export { AgentSmith, AvailableTools };
