import { Tool, StringOutput, RunOptions } from "../core/Tool";
import { ExecutionContext } from "../core/ExecutionContext";
import { z } from "zod";
import { create, all, evaluate, ConfigOptions } from "mathjs";
import { program } from 'commander';

interface CalculatorInput {
  expression: string;
}

export class CalculatorTool extends Tool<CalculatorInput, StringOutput> {
  private readonly mathInstance;

  constructor(config?: ConfigOptions) {
    super(
      "Calculator",
      `A calculator tool that performs basic arithmetic operations like addition, subtraction, multiplication, and division. 
Only use the calculator tool if you need to perform a calculation.`
    );

    // Create a restricted math.js instance
    this.mathInstance = create(all, config);

    // Disable potentially dangerous functions
    this.mathInstance.import({
      import: () => {
        throw new Error("Function import is disabled");
      },
      createUnit: () => {
        throw new Error("Function createUnit is disabled");
      },
      // parse: () => {
      //   throw new Error("Function parse is disabled");
      // },
      simplify: () => {
        throw new Error("Function simplify is disabled");
      },
      derivative: () => {
        throw new Error("Function derivative is disabled");
      },
      resolve: () => {
        throw new Error("Function resolve is disabled");
      },
      sin: () => {
        throw new Error("Function sin is disabled");
      },
      cos: () => {
        throw new Error("Function cos is disabled");
      },
      tan: () => {
        throw new Error("Function tan is disabled");
      },
      integrate: () => {
        throw new Error("Function integrate is disabled");
      }
    }, { override: true });
  }

  schema(): z.ZodSchema<CalculatorInput> {
    return z.object({
      expression: z
        .string()
        .min(1)
        .describe(
          "The mathematical expression to evaluate (e.g., '2 + 3 * 4'). Use basic mathematical expression syntax."
        )
    });
  }

  protected async execute(
    input: CalculatorInput,
    context: ExecutionContext,
    options: RunOptions
  ): Promise<StringOutput> {
    try {
      // Use basic arithmetic evaluation instead of the full evaluate function
      const result = this.mathInstance.compile(input.expression).evaluate();
      console.log(`Calculator: Result of ${input.expression} is ${result}`);
      // Convert the result to a string and return
      return new StringOutput(
        result.toString(),
        { expression: input.expression }
      );
    } catch (error) {
      if (error instanceof Error) {
        // Make the error message more specific based on the type of error
        const errorMessage = error.message.includes('Undefined function')
          ? `Function ${error.message.split(' ')[2]} is disabled`
          : error.message;
        throw new Error(`Calculation error: ${errorMessage}`);
      }
      throw new Error('Unknown calculation error occurred');
    }
  }
}

async function main() {
  program
    .name('calculator')
    .description('Evaluate mathematical expressions from the command line')
    .option('-e, --expression <string>', 'Mathematical expression to evaluate')
    .parse();

  const options = program.opts();

  if (!options.expression) {
    console.error('Error: Expression is required');
    program.help();
    process.exit(1);
  }

  try {
    const tool = new CalculatorTool();
    const result = await tool.run({
      expression: options.expression
    });

    // Pretty print results
    console.log('\nCalculation Result:\n');
    console.log(`Expression: ${options.expression}`);
    console.log(`Result: ${result.getContent()}\n`);

    // Print metadata
    console.log('Metadata:', result.metadata);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Only run main when this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
