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
      }))
    });
  }

  public async execute(input: AgentGeneratorInput, context: ExecutionContext, runOptions: RunOptions): Promise<AgentGeneratorOutput> {
    console.log("CreationTool executed:\n");
    const output = context.environment.outputDirectory;
    console.log(`Tool output directory: ${output}`);
    console.log(`Tool agent name: ${context.toolPreferences?.get("AgentGenerator")?.customOptions?.agentName}`);

    const options: AgentScaffoldOptions = {
      name: input.name,
      role: input.role,
      goal: input.goal,
      capabilities: input.capabilities,
      instructions: input.instructions,
      outputDir: output
    };
    const agentDir = await generateAgentScaffold(options);
    console.log(`Agent scaffold generated in: ${agentDir}`);

    // Return a JSONOutput instance instead of a custom object
    return new JSONOutput({
      agentDir: agentDir,
      agentName: input.name,
      instructions: input.instructions
    });
  }
}
