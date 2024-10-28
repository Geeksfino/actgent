import { ExecutionContext } from "./ExecutionContext";
import { ClassificationTypeConfig } from "./IClassifier";
import { z } from "zod";
import { EventEmitter } from "events";
import { InferClassificationUnion } from "./TypeInference";

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
    return JSON.stringify(this.content);
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
    this.emitter = new EventEmitter();
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

  private validateInput(input: ToolInput): asserts input is ToolInput {
    const result = this.schema().safeParse(input);
    if (!result.success) {
      throw new ValidationError("Input validation failed", result.error.errors);
    }
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

      await this.events?.onStart?.(input, this.context, finalOptions);

      const result = await this.withRetry(
        () => this.execute(input, this.context, finalOptions),
        input,
        finalOptions
      );

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

      await this.events?.onError?.(
        toolError,
        input,
        this.context,
        options
      );
      throw toolError;
    }
  }
}

// Dynamic Tool Implementation
export class DynamicTool<TInput, TOutput extends ToolOutput> extends Tool<
  TInput,
  TOutput
> {
  constructor(
    name: string,
    description: string,
    private inputSchema: z.ZodSchema<TInput>,
    private handler: (
      input: TInput,
      context: ExecutionContext,
      options: RunOptions
    ) => Promise<TOutput>,
    options?: ToolOptions,
    events?: ToolEvents<TInput, TOutput>
  ) {
    super(name, description, options, events);
  }

  schema(): z.ZodSchema<TInput> {
    return this.inputSchema;
  }

  protected execute(
    input: TInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<TOutput> {
    return this.handler(input, context, options);
  }
}
