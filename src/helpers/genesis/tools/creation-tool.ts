import { JSONOutput, RunOptions, Tool, ToolOptions, ToolOutput } from "../../../core/Tool";
import { ExecutionContext } from "../../../core/ExecutionContext";
import { AgentScaffoldOptions, generateAgentScaffold } from "./scaffold-generator";
import { Instruction } from "../../../core/configs";
import { z } from "zod";

export interface AgentGeneratorInput {
  name: string;
  role: string;
  goal: string;
  capabilities: string;
  instructions: Instruction[];
  tools?: string[];
};

// Remove the custom interface and use JSONOutput directly
export type AgentGeneratorOutput = JSONOutput<{
  agentDir: string;
  agentName: string;
  instructions: Instruction[];
}>;

export class AgentGenerator extends Tool<
  AgentGeneratorInput,
  AgentGeneratorOutput
> {

  constructor() {
    super(
      "AgentGenerator", 
      "Generate an agent based on the input description"
    );
  }

  schema(): z.ZodSchema<AgentGeneratorInput> {
    return z.object({
      name: z.string(),
      role: z.string(),
      goal: z.string(),
      capabilities: z.string(),
      instructions: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        schemaTemplate: z.any().optional() // Changed from z.string() to z.any() to allow complex objects
      })),
      tools: z.array(z.string()).optional()
    });
  }

  public async execute(input: AgentGeneratorInput, context: ExecutionContext, runOptions: RunOptions): Promise<AgentGeneratorOutput> {
    console.log("CreationTool executed:\n");
    const output = context.environment.outputDirectory;
    console.log(`Tool output directory: ${output}`);
    
    // Get the tool preferences from context
    const agentPrefs = context.toolPreferences?.get("AgentGenerator")?.customOptions;
    console.log(`Tool preferences:`, agentPrefs);

    const options: AgentScaffoldOptions = {
      name: input.name,
      role: input.role,
      goal: input.goal,
      capabilities: input.capabilities,
      instructions: input.instructions,
      tools: agentPrefs?.tools || [],  // Get tools from preferences
      outputDir: output
    };
    
    const agentDir = await generateAgentScaffold(options);
    console.log(`Agent scaffold generated in: ${agentDir}`);

    return new JSONOutput({
      agentDir: agentDir,
      agentName: input.name,
      instructions: input.instructions
    });
  }
}
