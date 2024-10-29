import { describe, it, expect, beforeEach } from "vitest";
import { CalculatorTool } from "../calculator";

describe("CalculatorTool", () => {
  let calculator: CalculatorTool;

  beforeEach(() => {
    calculator = new CalculatorTool();
  });

  describe("basic arithmetic and parentheses", () => {
    const validExpressions = [
      ["2 + 2", "4"],
      ["5 - 3", "2"],
      ["4 * 3", "12"],
      ["10 / 2", "5"],
      ["2 + 3 * 4", "14"],
      ["(2 + 3) * 4", "20"],
      ["((2 + 3) * 4) / 2", "10"],
    ];

    validExpressions.forEach(([expression, expected]) => {
      it(`should evaluate ${expression} correctly`, async () => {
        const result = await calculator.run({ expression }, {});
        expect(result.getContent()).toBe(expected);
      });
    });
  });

  describe("function restrictions", () => {
    const disabledFunctions = [
      "sin(45)",
      "cos(45)",
      "tan(45)",
      'derivative("x^2", "x")',
      'integrate("x^2", "x")',
    ];

    disabledFunctions.forEach((expression) => {
      it(`should block ${expression}`, async () => {
        const functionName = expression.split("(")[0];
        await expect(
          calculator.run({ expression }, {})
        ).rejects.toThrow(
          `Calculation error: Function ${functionName} is disabled`
        );
      });
    });
  });
});
