import { ExecutionContext } from "./ExecutionContext";
import { ClassificationTypeConfig } from "./IClassifier";
import { z } from "zod";
import { EventEmitter } from "events";
import { InferClassificationUnion } from "./TypeInference";
import { getEventEmitter } from "./observability/AgentEventEmitter";
import crypto from "crypto";

export type ToolInput = InferClassificationUnion<readonly ClassificationTypeConfig[]>;

export abstract class ToolOutput {
  abstract getContent(): string;
}

export class StringOutput extends ToolOutput {
  constructor(
    private content: string,
    public metadata?: Record<string, any>
  ) {
    super();
  }

  getContent(): string {
    return this.content;
  }
}

export class JSONOutput<T> extends ToolOutput {
  constructor(
    private content: T,
    public metadata?: Record<string, any>
  ) {
    super();
  }

  getContent(): string {
    return JSON.stringify(this.content, null, 2);
  }

  getTypedContent(): T {
    return this.content;
  }
}

// Error Types
export class ToolError extends Error {
  constructor(
    message: string,
    public context: Record<string, any> = {}
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class ValidationError extends ToolError {
  constructor(
    message: string,
    public errors: Array<any>
  ) {
    super(message, { validationErrors: errors });
    this.name = "ValidationError";
  }
}

// Tool Configuration Types
export interface ToolOptions {
  cache?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  context?: Record<string, any>;
}

// Tool Events Interface
export interface ToolEvents<TInput = any, TOutput = any> {
  onStart?: (
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ) => Promise<void>;
  onSuccess?: (
    output: TOutput,
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ) => Promise<void>;
  onError?: (
    error: ToolError,
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ) => Promise<void>;
  onRetry?: (
    error: ToolError,
    attempt: number,
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ) => Promise<void>;
}

// Main Tool Abstract Class
export abstract class Tool<
  ToolInput,
  TOutput extends ToolOutput = ToolOutput,
  TOptions extends ToolOptions = ToolOptions,
> {
  protected readonly emitter: EventEmitter;
  protected readonly options: TOptions;
  protected context: ExecutionContext = ExecutionContext.getInstance(); // this shall be set by the agent

  constructor(
    public readonly name: string,
    public readonly description: string,
    options?: TOptions,
    protected readonly events?: ToolEvents<ToolInput, TOutput>
  ) {
    this.options = options || ({} as TOptions);
    this.emitter = getEventEmitter();
  }

  public setContext(context: ExecutionContext) {
    this.context = context;
  }

  abstract schema(): z.ZodSchema<ToolInput>;

  protected abstract execute(
    input: ToolInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<TOutput>;

  private validateInput(input: ToolInput): { success: boolean; errors?: any[] } {
    const result = this.schema().safeParse(input);
    if (!result.success) {
      return { success: false, errors: result.error.errors };
    }
    return { success: true };
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    input: ToolInput,
    options: RunOptions
  ): Promise<T> {
    const maxRetries = this.options.maxRetries || 0;
    const delay = this.options.retryDelay || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) throw error;

        const toolError =
          error instanceof ToolError
            ? error
            : new ToolError(error.message, { originalError: error });

        await this.events?.onRetry?.(
          toolError,
          attempt + 1,
          input,
          this.context,
          options
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(2, attempt))
        );
      }
    }

    throw new ToolError("Max retries exceeded");
  }

  async run(input: ToolInput, options: RunOptions = {}): Promise<TOutput> {
    try {
      this.validateInput(input);

      const timeout = this.options.timeout;
      const controller = new AbortController();
      if (timeout) {
        setTimeout(() => controller.abort(), timeout);
      }

      const finalOptions = {
        ...options,
        signal: options.signal || controller.signal,
      };

      // Apply tool preferences
      const preferences = this.context.getToolPreference(this.name);
      if (preferences?.customOptions) {
        Object.assign(finalOptions, preferences.customOptions);
      }

      // Emit tool start event
      this.emitter.emit('TOOL_STARTED', {
        eventId: crypto.randomUUID(),
        eventType: 'TOOL_STARTED',
        timestamp: new Date().toISOString(),
        data: {
          toolInfo: {
            toolName: this.name,
            arguments: input,
            executionStart: new Date().toISOString(),
            status: 'started'
          }
        }
      });

      await this.events?.onStart?.(input, this.context, finalOptions);

      const startTime = new Date().toISOString();
      const result = await this.withRetry(
        () => this.execute(input, this.context, finalOptions),
        input,
        finalOptions
      );

      // Emit tool completion event
      this.emitter.emit('TOOL_COMPLETED', {
        eventId: crypto.randomUUID(),
        eventType: 'TOOL_COMPLETED',
        timestamp: new Date().toISOString(),
        data: {
          toolInfo: {
            toolName: this.name,
            result,
            executionStart: startTime,
            executionEnd: new Date().toISOString(),
            status: 'completed'
          }
        }
      });

      await this.events?.onSuccess?.(result, input, this.context, finalOptions);
      return result;
    } catch (err) {
      // Type guard for Error objects
      const error = err instanceof Error ? err : new Error(String(err));

      const toolError =
        error instanceof ToolError
          ? error
          : new ToolError(error.message, {
              originalError: error,
              stack: error.stack,
            });

      // Emit tool error event
      this.emitter.emit('TOOL_ERROR', {
        eventId: crypto.randomUUID(),
        eventType: 'TOOL_ERROR',
        timestamp: new Date().toISOString(),
        data: {
          toolInfo: {
            toolName: this.name,
            error: {
              name: toolError.name,
              message: toolError.message,
              stack: toolError.stack,
              ...toolError.context
            },
            status: 'error'
          }
        }
      });

      await this.events?.onError?.(toolError, input, this.context, options);
      throw toolError;
    }
  }

  /**
   * Generates an OpenAI-compatible function description for this tool
   */
  public getFunctionDescription(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
      };
    };
  } {
    const schema = this.schema();
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: this.extractSchemaProperties(schema),
          required: this.extractRequiredFields(schema),
        }
      }
    };
  }

  private extractSchemaProperties(schema: z.ZodSchema): Record<string, any> {
    if (schema instanceof z.ZodObject) {
      const shape = schema._def.shape();
      const properties: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodType) {
          properties[key] = this.zodTypeToJsonSchema(value);
        }
      }
      
      return properties;
    }
    return {};
  }

  private extractRequiredFields(schema: z.ZodSchema): string[] {
    if (schema instanceof z.ZodObject) {
      const shape = schema._def.shape();
      return Object.entries(shape)
        .filter(([_, value]) => !(value instanceof z.ZodOptional))
        .map(([key]) => key);
    }
    return [];
  }

  private zodTypeToJsonSchema(zodSchema: z.ZodTypeAny): any {
    if (zodSchema instanceof z.ZodString) {
      return { type: 'string', description: zodSchema.description };
    }
    if (zodSchema instanceof z.ZodNumber) {
      return { type: 'number', description: zodSchema.description };
    }
    if (zodSchema instanceof z.ZodBoolean) {
      return { type: 'boolean', description: zodSchema.description };
    }
    if (zodSchema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodTypeToJsonSchema(zodSchema.element),
        description: zodSchema.description
      };
    }
    if (zodSchema instanceof z.ZodObject) {
      return {
        type: 'object',
        properties: this.extractSchemaProperties(zodSchema),
        required: this.extractRequiredFields(zodSchema),
        description: zodSchema.description
      };
    }
    if (zodSchema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: zodSchema._def.values,
        description: zodSchema.description
      };
    }
    if (zodSchema instanceof z.ZodOptional) {
      return this.zodTypeToJsonSchema(zodSchema.unwrap());
    }
    return { type: 'string' }; // fallback
  }
}

// Dynamic Tool Implementation
export class ToolBuilder<TInput, TOutput extends ToolOutput> extends Tool<
  TInput,
  TOutput
> {
  constructor(
    private fields: {
      name: string;
      description: string;
      inputSchema: z.ZodSchema<TInput>;
      handler: (
        input: TInput,
        context: ExecutionContext,
        options: RunOptions,
        // Add run context for better extensibility
        runContext?: { tool: ToolBuilder<TInput, TOutput> }
      ) => Promise<TOutput>;
      options?: ToolOptions;
      events?: ToolEvents<TInput, TOutput>;
    }
  ) {
    // Validate the fields before calling super
    const validationSchema = z.object({
      name: z
        .string()
        .regex(/^[a-zA-Z0-9\-_]+$/, "Tool name must only contain alphanumeric characters, hyphens, or underscores"),
      description: z.string().min(1, "Description cannot be empty"),
      inputSchema: z.instanceof(z.ZodSchema),
      handler: z.function(),
      options: z.record(z.any()).optional(),
      events: z.record(z.any()).optional()
    });

    const result = validationSchema.safeParse(fields);
    if (!result.success) {
      throw new ValidationError("Invalid tool configuration", result.error.errors);
    }

    super(fields.name, fields.description, fields.options, fields.events);
  }

  schema(): z.ZodSchema<TInput> {
    return this.fields.inputSchema;
  }

  protected execute(
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<TOutput> {
    return this.fields.handler(input, context, options, { tool: this });
  }
}
