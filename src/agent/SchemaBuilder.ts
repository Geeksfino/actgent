import { Instruction } from "../core/configs";
import { ClassificationTypeConfig } from "../core/IClassifier";

/**
 * SchemaBuilder creates immutable classification type configurations from instructions.
 * All returned objects and arrays are readonly to ensure type safety across the application.
 */
export class SchemaBuilder {
    private readonly instructions: readonly Instruction[];

    public constructor(instructions: readonly Instruction[]) {
        // Create an immutable copy of instructions
        this.instructions = [...instructions];
        Object.freeze(this.instructions);
    }

    private mapInstructionsToClassificationTypes(): readonly ClassificationTypeConfig[] {
        const types = this.instructions.map((instruction) => {
            // Create an immutable schema object
            const schema: Readonly<Record<string, any>> = Object.freeze({ 
                content: Object.freeze({}),
                ...(instruction.schemaTemplate ? (() => {
                    try {
                        return JSON.parse(instruction.schemaTemplate);
                    } catch (error) {
                        console.warn(`Failed to parse schema for ${instruction.name}: ${error}`);
                        return {};
                    }
                })() : {})
            });

            // Create an immutable classification type
            return Object.freeze({
                name: instruction.name,
                description: instruction.description || "",
                schema,
            });
        });

        // Freeze the array and return
        return Object.freeze(types);
    }

    public build(): readonly ClassificationTypeConfig[] {
        return this.mapInstructionsToClassificationTypes();
    }

    public addInstruction(instruction: Instruction): SchemaBuilder {
        // Create a new builder instead of mutating
        return new SchemaBuilder([...this.instructions, instruction]);
    }

    public removeInstruction(name: string): SchemaBuilder {
        // Create a new builder instead of mutating
        return new SchemaBuilder(
            this.instructions.filter((i) => i.name !== name)
        );
    }
}
