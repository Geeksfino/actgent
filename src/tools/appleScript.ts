import { Tool, JSONOutput, RunOptions, ToolError } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";
import { program } from 'commander';

const execAsync = promisify(exec);

interface AppleScriptResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface AppleScriptInput {
  script: string;
  timeout?: number;
}

export class AppleScriptTool extends Tool<AppleScriptInput, JSONOutput<AppleScriptResult>> {
  constructor() {
    super(
      "AppleScript",
      "Execute AppleScript commands on macOS systems"
    );

    // Check if running on macOS
    if (platform() !== 'darwin') {
      throw new Error("AppleScriptTool is only supported on macOS systems");
    }
  }

  schema(): z.ZodSchema<AppleScriptInput> {
    return z.object({
      script: z
        .string()
        .min(1)
        .describe("The AppleScript command or script to execute"),
      timeout: z
        .number()
        .min(100)
        .max(30000)
        .optional()
        .default(5000)
        .describe("Timeout in milliseconds (100-30000)")
    });
  }

  protected async execute(
    input: AppleScriptInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<JSONOutput<AppleScriptResult>> {
    try {
      // Sanitize the script input
      const sanitizedScript = this.sanitizeScript(input.script);
      
      // Execute the AppleScript
      const { stdout, stderr } = await execAsync(`osascript -e '${sanitizedScript}'`, {
        timeout: input.timeout
      });

      if (stderr) {
        return new JSONOutput<AppleScriptResult>({
          success: false,
          error: stderr
        });
      }

      return new JSONOutput<AppleScriptResult>({
        success: true,
        output: stdout.trim()
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new JSONOutput<AppleScriptResult>({
        success: false,
        error: `AppleScript execution failed: ${message}`
      });
    }
  }

  private sanitizeScript(script: string): string {
    // Basic sanitization to prevent command injection
    return script
      .replace(/'/g, "'\"'\"'") // Escape single quotes
      .replace(/\$/g, "\\$")    // Escape dollar signs
      .replace(/`/g, "\\`");    // Escape backticks
  }
}

async function main() {
  program
    .name('applescript')
    .description('Execute AppleScript commands from the command line')
    .requiredOption('-s, --script <string>', 'AppleScript command or script to execute')
    .option('-t, --timeout <number>', 'Timeout in milliseconds (100-30000)', '5000')
    .parse();

  const options = program.opts();

  try {
    const tool = new AppleScriptTool();
    const result = await tool.run({
      script: options.script,
      timeout: parseInt(options.timeout, 10)
    });

    const content = result.getTypedContent();

    // Pretty print results
    console.log('\nAppleScript Execution Result:\n');
    if (content.success) {
      console.log('Output:', content.output);
    } else {
      console.error('Error:', content.error);
    }

    // Print metadata if available
    if (result.metadata) {
      console.log('\nMetadata:', result.metadata);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
} 