import { z } from "zod";
import { ToolBuilder, StringOutput } from "../../src/core/Tool";

// Define the input schema for the calculator
const calculatorSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
  a: z.number(),
  b: z.number(),
});

// Create the calculator tool
const calculatorTool = new ToolBuilder({
  name: "calculator",
  description: "Performs basic arithmetic operations on two numbers",
  inputSchema: calculatorSchema,
  handler: async (input, context, options) => {
    let result: number;
    
    switch (input.operation) {
      case "add":
        result = input.a + input.b;
        break;
      case "subtract":
        result = input.a - input.b;
        break;
      case "multiply":
        result = input.a * input.b;
        break;
      case "divide":
        if (input.b === 0) {
          throw new Error("Division by zero is not allowed");
        }
        result = input.a / input.b;
        break;
    }

    return new StringOutput(`${input.a} ${input.operation} ${input.b} = ${result}`);
  },
  options: {
    maxRetries: 2,
    retryDelay: 1000,
  },
  events: {
    onStart: async (input, context, options) => {
      console.log(`Starting calculation: ${input.operation}`);
    },
    onSuccess: async (output, input, context, options) => {
      console.log(`Calculation completed: ${output.getContent()}`);
    },
  },
});

// Usage example:
async function example() {
  try {
    const result = await calculatorTool.run({
      operation: "add",
      a: 5,
      b: 3,
    });
    console.log(result.getContent()); // Output: "5 add 3 = 8"
  } catch (error) {
    console.error("Calculator error:", error);
  }
}

example();