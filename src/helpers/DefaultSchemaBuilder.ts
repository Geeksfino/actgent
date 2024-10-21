import { ClassificationTypeConfig } from "../core/IClassifier";
import { z } from "zod";

function convertTemplateToSchema(
  template: Record<string, any>
): z.ZodObject<any> {
  const schema: Record<string, any> = {};

  for (const [key, value] of Object.entries(template)) {
    if (typeof value === "string") {
      // Replace placeholder types with Zod types
      if (value.includes("<") && value.includes(">")) {
        // Detect placeholders
        schema[key] = z.string(); // Treat placeholders as strings
      } else if (value === "hex") {
        schema[key] = z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color.");
      } else if (value === "url") {
        schema[key] = z.string().url(); // URL validation
      } else if (value === "boolean") {
        schema[key] = z.boolean();
      } else if (value === "number") {
        schema[key] = z.number();
      } else {
        schema[key] = z.string(); // Default to string
      }
    } else if (typeof value === "object") {
      // Recursively convert objects
      schema[key] = convertTemplateToSchema(value);
    } else {
      schema[key] = z.any(); // Fallback for any other type
    }
  }

  return z.object(schema);
}

export class DefaultSchemaBuilder {
  private classificationTypes: ClassificationTypeConfig[];
  private isJson: boolean = true;
  private taskCompleteSchema?: z.ZodObject<any>;

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
        description:
          "When more information is needed to proceed, respond with this output structure.",
        schema: {
          content: {
            questions: ["<QUESTION_1>", "<QUESTION_2>", "..."],
          },
        },
      },
      {
        name: DefaultSchemaBuilder.CONFIRMATION_NEEDED,
        description:
          "When the user needs to choose from specific options to continue, use this output structure.",
        schema: {
          content: {
            prompt: "<DECISION_PROMPT>",
            options: ["<OPTION_1>", "<OPTION_2>", "..."],
          },
        },
      },
      {
        name: DefaultSchemaBuilder.TASK_COMPLETE,
        description:
          "When a final result or answer has been generated and no further action is required, use this output structure.",
        schema: {
          content: {
            result: "<FINAL_RESULT_OR_ANSWER>",
          },
        },
      },
      // {
      //     name: DefaultSchemaBuilder.COMMAND,
      //     description: "When a pre-registered tool needs to be used before proceeding, respond with this output structure.",
      //     schema: {
      //         content: {
      //             action: "<TOOL_NAME>",
      //             parameters: {
      //                 "<PARAM_1_NAME>": "<PARAM_1_VALUE>",
      //                 "<PARAM_2_NAME>": "<PARAM_2_VALUE>",
      //                 "...": "..."
      //             }
      //         }
      //     }
      // },
      {
        name: DefaultSchemaBuilder.ERROR_OR_UNABLE,
        description:
          "When the task cannot be completed due to errors, insufficient information, or other constraints, use this output structure.",
        schema: {
          content: {
            reason: "<ERROR_DESCRIPTION_OR_CONSTRAINT>",
            suggestedAction: "<SUGGESTED_NEXT_STEP_IF_APPLICABLE>",
          },
        },
      },
    ];
  }

  public getClassificationTypes(): ClassificationTypeConfig[] {
    return this.classificationTypes;
  }

  public getSchema(
    type:
      | typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED
      | typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED
      | typeof DefaultSchemaBuilder.TASK_COMPLETE
      | typeof DefaultSchemaBuilder.COMMAND
      | typeof DefaultSchemaBuilder.ERROR_OR_UNABLE
  ): object {
    const classType = this.classificationTypes.find((t) => t.name === type);
    if (classType) {
      return classType.schema;
    }
    return {};
  }

  public setDescription(
    type:
      | typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED
      | typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED
      | typeof DefaultSchemaBuilder.TASK_COMPLETE
      | typeof DefaultSchemaBuilder.COMMAND
      | typeof DefaultSchemaBuilder.ERROR_OR_UNABLE,
    description: string
  ): void {
    const classType = this.classificationTypes.find((t) => t.name === type);
    if (classType) {
      classType.description = description;
    }
  }

  public setSchema(
    type:
      | typeof DefaultSchemaBuilder.CLARIFICATION_NEEDED
      | typeof DefaultSchemaBuilder.CONFIRMATION_NEEDED
      | typeof DefaultSchemaBuilder.TASK_COMPLETE
      | typeof DefaultSchemaBuilder.COMMAND
      | typeof DefaultSchemaBuilder.ERROR_OR_UNABLE,
    schema: object
  ): void {
    const classType = this.classificationTypes.find((t) => t.name === type);
    if (classType) {
      classType.schema = schema;
    }
  }

  public setFormattedOutputForCompletedTask(
    formattedOutput: string,
    isJson: boolean = true
  ): void {
    if (isJson) {
      this.isJson = true;
    } else {
      this.isJson = false;
    }

    const taskCompleteType = this.classificationTypes.find(
      (t) => t.name === DefaultSchemaBuilder.TASK_COMPLETE
    );
    if (taskCompleteType) {
      taskCompleteType.schema.content.result = formattedOutput;
      if (this.isJson) {
        this.taskCompleteSchema = convertTemplateToSchema(taskCompleteType.schema.content.result);
      }
    }
  }

  public validateJson(jsonString: string): any {
    try {
      const output = JSON.parse(jsonString);
      if (this.taskCompleteSchema) {
        const generated = this.taskCompleteSchema.parse(output);
        return generated;
      }
      return output;
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error("Validation failed:", e.errors);
      } else {
        console.error("Unexpected error:", e);
      }
    }
  }
}
