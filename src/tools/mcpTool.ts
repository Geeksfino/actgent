/**
 * MCP tool implementation for actgent
 * This tool represents a single tool from an MCP server
 */

import { Tool, ToolInput, ToolOutput, StringOutput } from "../core/Tool";
import { McpClient } from "../mcp/client";
import { z } from "zod";
import { withTags } from "../core/Logger";
import { toolLoggers } from "./logging";

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
  private logger = toolLoggers.mcp;

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
    
    // Convert input schema to Zod schema properly
    this.inputZodSchema = inputSchema instanceof z.ZodSchema 
      ? inputSchema 
      : this.convertJsonSchemaToZod(inputSchema);
  }
  
  /**
   * Returns the schema for this tool
   */
  schema(): z.ZodSchema<McpToolInput> {
    return this.inputZodSchema as z.ZodSchema<McpToolInput>;
  }

  /**
   * Converts a JSON schema to a Zod schema, preserving properties and required fields
   * @param jsonSchema The JSON schema to convert
   * @returns A Zod schema equivalent to the JSON schema
   */
  private convertJsonSchemaToZod(jsonSchema: any): z.ZodSchema {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      // Default to a record schema if no schema is provided
      return z.record(z.any());
    }

    // Handle schema with properties object
    if (jsonSchema.type === 'object' && jsonSchema.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];

      // Convert each property to its corresponding Zod type
      Object.entries(jsonSchema.properties).forEach(([key, propSchema]: [string, any]) => {
        let zodType: z.ZodTypeAny;

        switch (propSchema.type) {
          case 'string':
            zodType = z.string();
            if (propSchema.description) {
              zodType = zodType.describe(propSchema.description);
            }
            break;
          case 'number':
          case 'integer':
            zodType = z.number();
            if (propSchema.description) {
              zodType = zodType.describe(propSchema.description);
            }
            break;
          case 'boolean':
            zodType = z.boolean();
            if (propSchema.description) {
              zodType = zodType.describe(propSchema.description);
            }
            break;
          case 'array':
            // For arrays, use z.array with any if items not defined
            if (propSchema.items) {
              const itemSchema = this.convertJsonSchemaToZod(propSchema.items);
              zodType = z.array(itemSchema);
            } else {
              zodType = z.array(z.any());
            }
            if (propSchema.description) {
              zodType = zodType.describe(propSchema.description);
            }
            break;
          case 'object':
            // Recursively convert nested object schemas
            zodType = this.convertJsonSchemaToZod(propSchema);
            break;
          default:
            zodType = z.any();
            if (propSchema.description) {
              zodType = zodType.describe(propSchema.description);
            }
            break;
        }

        // Make optional if not in required array
        shape[key] = required.includes(key) ? zodType : zodType.optional();
      });

      return z.object(shape);
    }

    // If the schema doesn't have properties but has a type
    if (jsonSchema.type) {
      switch (jsonSchema.type) {
        case 'string':
          return z.string().describe(jsonSchema.description || '');
        case 'number':
        case 'integer':
          return z.number().describe(jsonSchema.description || '');
        case 'boolean':
          return z.boolean().describe(jsonSchema.description || '');
        case 'array':
          if (jsonSchema.items) {
            return z.array(this.convertJsonSchemaToZod(jsonSchema.items));
          }
          return z.array(z.any());
        default:
          return z.any();
      }
    }

    // Fallback to record for other cases
    return z.record(z.any());
  }

  /**
   * Executes the tool by calling the corresponding tool on the MCP server
   * @param input Tool input
   * @returns Promise that resolves to the tool output
   */
  async execute(input: McpToolInput): Promise<StringOutput> {
    console.log(`⭐ McpTool.execute called for tool: ${this.toolName}`);
    try {
      // Make sure we have a valid client connection
      if (!this.mcpClient) {
        console.log(`❌ MCP client is not available for ${this.toolName}`);
        throw new Error("MCP client is not available");
      }
      
      // Check if the input appears to be a serialized JSON string passed character by character
      // This handles a bug where the LLM function arguments come in as an object with numeric keys
      let processedInput = input;
      
      if (input && typeof input === 'object') {
        // Check for numeric keys which indicate a character-by-character serialized string
        const keys = Object.keys(input);
        const hasNumericKeys = keys.length > 0 && keys.every(k => !isNaN(parseInt(k, 10)));
        
        if (hasNumericKeys) {
          console.log(`⚠️ Detected serialized string passed character by character for ${this.toolName}`); 
          // Reconstruct the string from character-by-character object
          const serializedString = keys
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
            .map(k => (input as any)[k])
            .join('');
            
          try {
            // Parse the reconstructed JSON string
            const parsed = JSON.parse(serializedString);
            processedInput = parsed;
            console.log(`✅ Successfully reconstructed input from serialized string for ${this.toolName}`); 
          } catch (e) {
            console.error(`❌ Error parsing reconstructed input string for ${this.toolName}:`, e);
            // Keep original input if parsing fails
          }
        }
      }
      
      // Ensure input has messageType as required by the protocol
      const enhancedInput = { 
        ...processedInput,
        messageType: 'toolCall'
      };
      
      // Call the tool on the MCP server
      console.log(`⭐ Calling MCP tool ${this.toolName} with input:`, JSON.stringify(enhancedInput, null, 2));
      this.logger.debug(`Calling MCP tool ${this.toolName} with input: ${JSON.stringify(enhancedInput)}`,
        withTags(["mcp"])
      );
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
      
      // Log the formatted result for debugging
      console.log(`⭐ MCP tool ${this.toolName} execution result:`, JSON.stringify(formattedResult, null, 2));
      this.logger.debug(`MCP tool ${this.toolName} execution result:`, 
        withTags(["mcp", "tool-result"]), {
        result: formattedResult,
        contentSummary: formattedResult.content.map(c => ({
          type: c.type,
          textLength: c.text ? c.text.length : 0,
          hasData: !!c.data
        }))
      });
      
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
      
      // Log the error output for debugging
      console.log(`❌ MCP tool ${this.toolName} execution error:`, errorMessage);
      this.logger.error(`MCP tool ${this.toolName} execution error:`,
        withTags(["mcp", "tool-error"]), {
        error: errorMessage,
        errorOutput
      });
      
      return new StringOutput(JSON.stringify(errorOutput));
    }
  }
}
