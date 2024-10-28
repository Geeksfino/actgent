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

// Make JSONOutput<AgentGeneratorMetadata> explicitly extend ToolOutput
export interface AgentGeneratorOutput extends ToolOutput {
  agentDir: string;
}

export class AgentGenerator extends Tool<
  AgentGeneratorInput,    // The input type
  AgentGeneratorOutput    // The output type
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
      //name: context.toolPreferences?.get("AgentGenerator")?.customOptions?.agentName,
      name: input.name,
      role: input.role,
      goal: input.goal,
      capabilities: input.capabilities,
      instructions: input.instructions,
      outputDir: output
    };
    const agentDir = await generateAgentScaffold(options);
    console.log(`Agent scaffold generated in: ${agentDir}`);

    return {
      agentDir: agentDir,
      getContent() { return agentDir; } // Implement ToolOutput interface
    };
  }
}
