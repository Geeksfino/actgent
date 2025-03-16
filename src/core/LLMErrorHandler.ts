import { Session } from './Session';
import { logger, withTags } from './Logger';

/**
 * Error details extracted from LLM service errors
 */
export interface LLMErrorDetails {
  message: string;
  type: string;
  code: string | null;
  param: string | null;
  status: number | null;
  request_id: string | null;
  recoverable: boolean;
}

/**
 * Handler for LLM service errors
 * Provides utilities for extracting error details and handling errors gracefully
 */
export class LLMErrorHandler {
  /**
   * Extract detailed information from LLM service errors
   */
  static extractErrorDetails(error: any): LLMErrorDetails {
    const errorObj: LLMErrorDetails = {
      message: error.message || "Unknown error",
      type: error.type || "unknown_error",
      code: error.code || null,
      param: error.param || null,
      status: error.status || null,
      request_id: error.request_id || null,
      recoverable: true // Default to true unless specified otherwise
    };

    // Determine if the error is recoverable based on status code and error type
    if (error.status) {
      // 401, 403 and some 4xx errors are typically not recoverable without user/developer intervention
      if (error.status === 401 || error.status === 403) {
        errorObj.recoverable = false;
      }
    }

    return errorObj;
  }

  /**
   * Handle LLM service errors in a graceful way
   * @param error The error object from the LLM service
   * @param session The current session
   * @returns A string representation of the error that can be used as a response
   */
  static async handleError(error: any, session: Session): Promise<string> {
    const errorDetails = this.extractErrorDetails(error);
    
    // Log all errors for debugging
    logger.error(`LLM API error: ${errorDetails.message}`, withTags(["error", "llm-api"]), errorDetails);
    
    // Log error details for debugging
    logger.error(`LLM API error details:`, {
      sessionId: session.sessionId,
      errorType: errorDetails.type,
      errorCode: errorDetails.code,
      errorStatus: errorDetails.status
    });

    // Determine user-friendly message based on error type
    let userMessage = "There was an error communicating with the AI service. ";
    
    // Handle different error categories
    switch (errorDetails.status) {
      // Client errors (400-499)
      case 400: // Bad request
        userMessage += "The request was improperly formatted.";
        break;
        
      case 401: // Unauthorized
        userMessage += "Authentication failed. Please check your API key configuration.";
        break;
        
      case 403: // Forbidden
        userMessage += "Your account doesn't have permission to use this feature.";
        break;
        
      case 404: // Not found
        userMessage += "The requested AI model or resource was not found.";
        break;
        
      case 422: // Unprocessable entity
        if (errorDetails.code === "context_length_exceeded") {
          userMessage = "Your conversation is too long for the AI to process. Try starting a new conversation.";
        } else {
          userMessage += "The AI couldn't process this input.";
        }
        break;
        
      case 429: // Rate limit
        userMessage += "We've hit the rate limit for AI requests. Please try again in a moment.";
        break;
        
      // Server errors (500-599)
      case 500: // Internal server error
      case 502: // Bad gateway
      case 503: // Service unavailable
      case 504: // Gateway timeout
        userMessage += "The AI service is currently experiencing issues. Please try again later.";
        break;
        
      default:
        userMessage += "An unexpected error occurred.";
    }

    // Log user-friendly message
    logger.warn(`User-friendly error message: ${userMessage}`, {
      sessionId: session.sessionId
    });

    // Return a simple error message that can be used as a response
    return JSON.stringify({
      error: true,
      message: errorDetails.message,
      userMessage: userMessage
    });
  }
}
