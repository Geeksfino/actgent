import { JSONOutput, RunOptions, Tool } from "../../../core/Tool";
import { ExecutionContext } from "../../../core/ExecutionContext";
import { AgentGeneratorInput } from "./creation-tool";
import { AgentGenerator } from "./creation-tool";  // Import for schema access
import { serializeAgentScaffold } from "./scaffold-serializer";
import { z } from "zod";

interface FlattenInput {
    agentDir: string;
}

type FlattenOutput = JSONOutput<AgentGeneratorInput>;

export class AgentFlattener extends Tool<FlattenInput, FlattenOutput> {
    private readonly agentGenerator: AgentGenerator;

    constructor() {
        super(
            "AgentFlattener",
            "Flatten an agent directory back into its original configuration"
        );
        // Create an instance just for schema validation
        this.agentGenerator = new AgentGenerator();
    }

    schema(): z.ZodSchema<FlattenInput> {
        return z.object({
            agentDir: z.string()
        });
    }

    private validateAgentConfig(config: AgentGeneratorInput): AgentGeneratorInput {
        // Use the same schema from AgentGenerator for validation
        const validationResult = this.agentGenerator.schema().safeParse(config);
        
        if (!validationResult.success) {
            throw new Error(`Serialized agent configuration does not match schema: ${validationResult.error.message}`);
        }
        
        return validationResult.data;
    }

    public async execute(
        input: FlattenInput,
        context: ExecutionContext,
        runOptions: RunOptions
    ): Promise<FlattenOutput> {
        console.log("FlattenTool executed:\n");
        console.log(`Agent directory: ${input.agentDir}`);

        const result = await serializeAgentScaffold(input.agentDir);
        
        // Validate the serialized result against the same schema used for creation
        const validatedConfig = this.validateAgentConfig({
            agent_name: result.agent_name,
            role: result.role,
            goal: result.goal,
            capabilities: result.capabilities,
            instructions: result.instructions,
            tools: result.tools
        });

        return new JSONOutput(validatedConfig);
    }
}