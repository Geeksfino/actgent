import { ClassificationTypeConfig } from './IClassifier';

export class DefaultSchemaBuilder {
    private classificationTypes: ClassificationTypeConfig[];

    // Constants for classification type names
    static readonly CLARIFICATION_NEEDED = "CLARIFICATION_NEEDED";
    static readonly CONFIRMATION_NEEDED = "CONFIRMATION_NEEDED";
    static readonly TASK_COMPLETE = "TASK_COMPLETE";
    static readonly COMMAND = "COMMAND";
    static readonly ERROR_OR_UNABLE = "ERROR_OR_UNABLE";

    constructor() {
        this.classificationTypes = [
            {
                name: DefaultSchemaBuilder.CLARIFICATION_NEEDED,
                description: "When more information is needed to proceed, respond with this output structure.",
                schema: {
                    content: {
                        questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
                    }
                }
            },
            {
                name: DefaultSchemaBuilder.CONFIRMATION_NEEDED,
                description: "When the user needs to choose from specific options to continue, use this output structure.",
                schema: {
                    content: {
                        prompt: "<DECISION_PROMPT>",
                        options: ["<OPTION_1>", "<OPTION_2>", "..."],
                    }
                }
            },
            {
                name: DefaultSchemaBuilder.TASK_COMPLETE,
                description: "When a final result or answer has been generated and no further action is required, use this output structure.",
                schema: {
                    content: {
                        result: "<FINAL_RESULT_OR_ANSWER>",
                        summary: "<BRIEF_SUMMARY_OF_RESULT>",
                    }
                }
            },
            {
                name: DefaultSchemaBuilder.COMMAND,
                description: "When a specific action needs to be performed or a tool needs to be used before proceeding, respond with this output structure.",
                schema: {
                    content: {
                        action: "<ACTION_NAME>",
                        parameters: {
                            "<PARAM_1_NAME>": "<PARAM_1_VALUE>",
                            "<PARAM_2_NAME>": "<PARAM_2_VALUE>",
                            "...": "..."
                        }
                    }
                }
            },
            {
                name: DefaultSchemaBuilder.ERROR_OR_UNABLE,
                description: "When the task cannot be completed due to errors, insufficient information, or other constraints, use this output structure.",
                schema: {
                    content: {
                        reason: "<ERROR_DESCRIPTION_OR_CONSTRAINT>",
                        suggestedAction: "<SUGGESTED_NEXT_STEP_IF_APPLICABLE>"
                    }
                }
            }
        ];
    }

    public getClassificationTypes(): ClassificationTypeConfig[] {
        return this.classificationTypes;
    }

    public getSchema(type: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED | 
                           typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED | 
                           typeof DefaultSchemaBuilder.TASK_COMPLETE | 
                           typeof DefaultSchemaBuilder.COMMAND | 
                           typeof DefaultSchemaBuilder.ERROR_OR_UNABLE): object {
        const classType = this.classificationTypes.find(t => t.name === type);
        if (classType) {
            return classType.schema;
        }
        return {};
    }

    public setDescription(type: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED | 
                                typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED | 
                                typeof DefaultSchemaBuilder.TASK_COMPLETE | 
                                typeof DefaultSchemaBuilder.COMMAND | 
                                typeof DefaultSchemaBuilder.ERROR_OR_UNABLE, 
                          description: string): void {
        const classType = this.classificationTypes.find(t => t.name === type);
        if (classType) {
            classType.description = description;
        }
    }

    public setSchema(type: typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED | 
                           typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED | 
                           typeof DefaultSchemaBuilder.TASK_COMPLETE | 
                           typeof DefaultSchemaBuilder.COMMAND | 
                           typeof DefaultSchemaBuilder.ERROR_OR_UNABLE, 
                     schema: object): void {
        const classType = this.classificationTypes.find(t => t.name === type);
        if (classType) {
            classType.schema = schema;
        }
    }

    public setFormattedOutputForCompletedTask(formattedOutput: string): void {
        const taskCompleteType = this.classificationTypes.find(t => t.name === DefaultSchemaBuilder.TASK_COMPLETE);
        if (taskCompleteType) {
            taskCompleteType.schema.content.result = formattedOutput;
        }
    }
}