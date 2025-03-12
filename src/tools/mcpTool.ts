/**
 * MCP tool implementation for actgent
 * This tool represents a single tool from an MCP server
 */

import { Tool, ToolInput, ToolOutput, StringOutput } from "../core/Tool";
import { McpClient } from "../mcp/client";
import { z } from "zod";

/**
 * Standard MCP content types that can be returned from tools
 */
type McpContent = {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: any;
};

/**
 * Standard MCP tool output as defined by the protocol
 */
type McpStandardOutput = {
  content: McpContent[];
  isError?: boolean;
};

/**
 * Tool input for McpTool representing a single tool on an MCP server
 */
type McpToolInput = ToolInput & {
  args?: Record<string, any>;
  // Using type intersection instead of interface extension
}

/**
 * McpTool represents a single tool from an MCP server
 * It uses its corresponding McpClient to execute the tool on the server
 */
export class McpTool extends Tool<McpToolInput, StringOutput> {
  private mcpClient: McpClient;
  private toolName: string;
  private inputZodSchema: z.ZodSchema;
  private outputSchema: any;

  /**
   * Creates a new MCP Tool instance that represents a single tool on an MCP server
   * @param mcpClient The MCP client connected to the server that hosts this tool
   * @param toolName Name of the tool on the MCP server
   * @param description Description of the tool from the MCP server
   * @param inputSchema Input schema for the tool
   * @param outputSchema Output schema for the tool
   */
  constructor(
    mcpClient: McpClient,
    toolName: string,
    description: string,
    inputSchema: any,
    outputSchema: any
  ) {
    // Use the actual tool name so the LLM can select it based on the description
    super(toolName, description, {});
    
    this.mcpClient = mcpClient;
    this.toolName = toolName;
    this.outputSchema = outputSchema;
    
    // Convert input schema to Zod schema if needed
    this.inputZodSchema = inputSchema instanceof z.ZodSchema 
      ? inputSchema 
      : z.record(z.any());
  }
  
  /**
   * Returns the schema for this tool
   */
  schema(): z.ZodSchema<McpToolInput> {
    return this.inputZodSchema as z.ZodSchema<McpToolInput>;
  }

  /**
   * Executes the tool by calling the corresponding tool on the MCP server
   * @param input Tool input
   * @returns Promise that resolves to the tool output
   */
  async execute(input: McpToolInput): Promise<StringOutput> {
    try {
      // Make sure we have a valid client connection
      if (!this.mcpClient) {
        throw new Error("MCP client is not available");
      }
      
      // Ensure input has messageType as required by the protocol
      const enhancedInput = { 
        ...input,
        messageType: 'toolCall'
      };
      
      // Call the tool on the MCP server
      const result = await this.mcpClient.callTool(this.toolName, enhancedInput);
      
      // Format the response according to MCP protocol standards
      let formattedResult: McpStandardOutput;
      
      // Handle both the new protocol format and backward compatibility format
      if (result && typeof result === 'object') {
        if (Array.isArray(result.content)) {
          // Already in the expected format
          formattedResult = result as McpStandardOutput;
        } else if (result.toolResult !== undefined) {
          // Handle legacy format with toolResult
          formattedResult = {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.toolResult)
              }
            ],
            isError: false
          };
        } else {
          // Generic object not following the standard format
          formattedResult = {
            content: [
              {
                type: "text",
                text: JSON.stringify(result)
              }
            ],
            isError: false
          };
        }
      } else {
        // Handle primitive response types
        formattedResult = {
          content: [
            {
              type: "text",
              text: typeof result === 'string' ? result : JSON.stringify(result)
            }
          ],
          isError: false
        };
      }
      
      // Return the result as a StringOutput
      return new StringOutput(JSON.stringify(formattedResult));
    } catch (error) {
      // Format errors according to MCP protocol
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorOutput: McpStandardOutput = {
        content: [
          {
            type: "text",
            text: `Error executing MCP tool ${this.toolName}: ${errorMessage}`
          }
        ],
        isError: true
      };
      
      return new StringOutput(JSON.stringify(errorOutput));
    }
  }
}
