import { ClassificationTypeConfig } from "../core/IClassifier";
import { AbstractClassifier } from "../core/AbstractClassifier";
import { InferClassificationUnion } from "../core/TypeInference";
import { logger } from "../core/Logger";
import { ValidationResult } from "../core/types/ValidationResult";
import { ValidationOptions } from "../core/types/ValidationResult";
export class ReActClassifier<T extends readonly ClassificationTypeConfig[]> extends AbstractClassifier<T> {
  constructor(schemaTypes: T) {
    super(schemaTypes);
  }

  protected parseLLMResponse(
    response: string,
    validationOptions: ValidationOptions
  ): {
    isToolCall: boolean;
    instruction: string | undefined;
    parsedLLMResponse: InferClassificationUnion<T>;
    validationResult: ValidationResult<InferClassificationUnion<T>>;
  } {
    try {
      const parsed = JSON.parse(response);
      
      // Special handling for tool/function calling responses
      if (parsed?.primary_action?.response_purpose === 'TOOL_INVOCATION') {
        const toolResponse = {
          messageType: 'TOOL_INVOCATION',
          toolName: parsed.primary_action.response_content.name,
          arguments: parsed.primary_action.response_content.parameters || {},
        };
        
        return {
          isToolCall: true,
          instruction: this.tryExtractMessageType(JSON.stringify(toolResponse)),
          parsedLLMResponse: toolResponse as InferClassificationUnion<T>,
          validationResult: { isValid: true, data: toolResponse as InferClassificationUnion<T> } 
        };
      }

      // Regular response handling
      if (!parsed?.primary_action?.response_content) {
        throw new Error("Invalid response format: primary_action.response_content is missing");
      }

      const content = parsed.primary_action.response_content;
      logger.debug('Validating content:', JSON.stringify(content, null, 2));
      
      // Validate against schema types
      const matchingSchema = this.schemaTypes.find(type => {
        //logger.debug(`Checking schema type: ${type.name}`);
        const matches = Object.entries(type.schema).every(([key, schemaValue]) => {
          const contentValue = content[key];
          const isValid = this.validateSchemaValue(contentValue, schemaValue);
          logger.debug(`  Property ${key}: ${isValid ? 'valid' : 'invalid'} (expected ${JSON.stringify(schemaValue)}, got ${JSON.stringify(contentValue)})`);
          return isValid;
        });
        return matches;
      });

      if (!matchingSchema) {
        return {
          isToolCall: false,
          instruction: this.tryExtractMessageType(JSON.stringify(content)),
          parsedLLMResponse: content as InferClassificationUnion<T>,
          validationResult: {
            isValid: false,
            error: `Response content does not match any defined schema types. Expected one of: ${this.schemaTypes.map(t => t.name).join(', ')}`,
            originalContent: content,
            data: content as InferClassificationUnion<T>
          }
        };
      }

      const finalResponse = {
        ...content,
        messageType: matchingSchema.name
      } as InferClassificationUnion<T>;

      return {
        isToolCall: false,
        instruction: this.tryExtractMessageType(JSON.stringify(finalResponse)),
        parsedLLMResponse: finalResponse,
        validationResult: { 
          isValid: true,
          data: finalResponse 
        }
      };

    } catch (error) {
      logger.error("Error parsing LLM response:", error);
      throw error;
    }
  }

  private validateSchemaValue(value: any, schemaValue: any): boolean {
    // Handle undefined/null cases
    if (value === undefined || value === null) {
      return false;
    }

    // Handle template strings (enclosed in <>)
    if (typeof schemaValue === 'string' && 
        schemaValue.startsWith('<') && 
        schemaValue.endsWith('>')) {
      return true;  // Accept any non-null value for template fields
    }

    // Handle arrays
    if (Array.isArray(schemaValue)) {
      if (!Array.isArray(value)) return false;
      if (value.length === 0) return false;  // Require at least one item
      
      // Get the template item from schema array
      const templateItem = schemaValue[0];
      
      // Validate each item in the array against the template
      return value.every(item => this.validateSchemaValue(item, templateItem));
    }

    // Handle objects
    if (typeof schemaValue === 'object' && schemaValue !== null) {
      if (typeof value !== 'object') return false;
      
      // Check if all required properties exist and are valid
      return Object.entries(schemaValue).every(([key, subSchema]) => {
        // For template objects, we only need to verify the structure matches
        if (typeof subSchema === 'object' && this.isTemplateObject(subSchema)) {
          return value.hasOwnProperty(key) && typeof value[key] === 'object';
        }
        return value.hasOwnProperty(key) && this.validateSchemaValue(value[key], subSchema);
      });
    }

    // For all other cases, just verify the value exists
    return true;
  }

  private isTemplateObject(obj: any): boolean {
    // Check if all values in the object are template strings
    return typeof obj === 'object' && obj !== null &&
           Object.values(obj).every(value => 
             typeof value === 'string' && 
             value.startsWith('<') && 
             value.endsWith('>')
           );
  }
}
