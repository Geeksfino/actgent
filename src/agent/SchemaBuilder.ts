import { Instruction } from "../core/interfaces";
import { ClassificationTypeConfig } from "../core/IClassifier";

export class SchemaBuilder {
    private instructions: Instruction[] = [];

    public constructor(instructions: Instruction[]) {
        this.instructions = instructions;
    }

    private mapInstructionsToClassificationTypes(): ClassificationTypeConfig[] {
        return this.instructions.map((instruction) => {
            let schema: Record<string, any> = { content: {} };
            if (instruction.schemaTemplate) {
                try {
                    schema = JSON.parse(instruction.schemaTemplate);
                } catch (error) {
                    console.warn(`Failed to parse schema for ${instruction.name}: ${error}`);
                }
            }
            return {
                name: instruction.name,
                description: instruction.description || "",
                schema,
            };
        });
    }

    public build(): ClassificationTypeConfig[] {
        return this.mapInstructionsToClassificationTypes();
    }

    public addInstruction(instruction: Instruction): void {
        this.instructions.push(instruction);
    }

    public removeInstruction(name: string): void {
        this.instructions = this.instructions.filter((i) => i.name !== name);
    }
}
