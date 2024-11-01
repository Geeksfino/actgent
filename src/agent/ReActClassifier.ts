import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";

export class ReActClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
  }

  protected parseLLMResponse(response: string): {
    isToolCall: boolean;
    parsedLLMResponse: InferClassificationUnion<T>;
  } {
    try {
      const parsed = JSON.parse(response);
      
      // Special handling for tool/function calling responses
      if (parsed?.action?.response_type === 'BUILTIN_TOOL') {
        // Transform the tool calling response into a consistent format
        const toolResponse = {
          messageType: 'BUILTIN_TOOL',
          toolName: parsed.action.response_content.name,
          arguments: parsed.action.response_content.parameters,
        };
        
        return {
          isToolCall: true,
          parsedLLMResponse: toolResponse as InferClassificationUnion<T>
        };
      }

      // Regular response handling
      if (!parsed?.action?.response_content) {
        throw new Error("Invalid response format: action.response_content is missing");
      }

      const content = parsed.action.response_content;
      console.log('Validating content:', JSON.stringify(content, null, 2));
      
      // Validate that the response matches one of our schema types
      const matchingSchema = this.schemaTypes.find(type => {
        console.log(`Checking schema type: ${type.name}`);
        const matches = Object.entries(type.schema).every(([key, schemaValue]) => {
          const contentValue = content[key];
          const isValid = this.validateSchemaValue(contentValue, schemaValue);
          console.log(`  Property ${key}: ${isValid ? 'valid' : 'invalid'} (expected ${JSON.stringify(schemaValue)}, got ${JSON.stringify(contentValue)})`);
          return isValid;
        });
        return matches;
      });

      if (!matchingSchema) {
        throw new Error(
          `Response content does not match any defined schema types. ` +
          `Expected one of: ${this.schemaTypes.map(t => t.name).join(', ')}\n` +
          `Received content: ${JSON.stringify(content, null, 2)}`
        );
      }

      // Add the messageType if it's not already present
      return {
        isToolCall: false,
        parsedLLMResponse: {
          ...content,
          messageType: matchingSchema.name
        } as InferClassificationUnion<T>
      };
    } catch (error) {
      console.error("Error parsing LLM response:", error);
      throw error;
    }
  }

  private validateSchemaValue(value: any, schemaValue: any): boolean {
    // Handle undefined cases
    if (value === undefined) {
      return false;
    }

    // Basic type checking
    if (typeof schemaValue === 'string') {
      // If schema value is a template (e.g., "<QUESTION_1>"), just check if value is a string
      if (schemaValue.startsWith('<') && schemaValue.endsWith('>')) {
        return typeof value === 'string';
      }
      return typeof value === schemaValue;
    }
    
    if (typeof schemaValue === 'object' && schemaValue !== null) {
      if (Array.isArray(schemaValue)) {
        return Array.isArray(value) && 
          (schemaValue.length === 0 || // Empty array schema matches any array
           value.every(v => this.validateSchemaValue(v, schemaValue[0])));
      }
      
      return typeof value === 'object' && 
        Object.entries(schemaValue).every(([k, v]) => 
          this.validateSchemaValue(value[k], v)
        );
    }
    
    return true; // Allow other types to pass through
  }
}
