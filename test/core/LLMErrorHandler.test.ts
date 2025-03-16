import { describe, it, expect } from 'vitest';
import { LLMErrorHandler } from '../../src/core/LLMErrorHandler';
import { Session } from '../../src/core/Session';

// Simple mock session for testing
const mockSession = {
  sessionId: 'test-session-id'
} as Session;

describe('LLMErrorHandler', () => {
  
  describe('extractErrorDetails', () => {
    it('should extract error details from an error object', () => {
      const error = {
        message: 'Test error message',
        type: 'test_error',
        code: 'test_code',
        param: 'test_param',
        status: 429,
        request_id: 'test-request-id'
      };
      
      const details = LLMErrorHandler.extractErrorDetails(error);
      
      expect(details).toEqual({
        message: 'Test error message',
        type: 'test_error',
        code: 'test_code',
        param: 'test_param',
        status: 429,
        request_id: 'test-request-id',
        recoverable: true
      });
    });
    
    it('should handle missing fields', () => {
      const error = {
        message: 'Test error message'
      };
      
      const details = LLMErrorHandler.extractErrorDetails(error);
      
      expect(details).toEqual({
        message: 'Test error message',
        type: 'unknown_error',
        code: null,
        param: null,
        status: null,
        request_id: null,
        recoverable: true
      });
    });
    
    it('should mark authentication errors as non-recoverable', () => {
      const error = {
        message: 'Authentication failed',
        status: 401
      };
      
      const details = LLMErrorHandler.extractErrorDetails(error);
      
      expect(details.recoverable).toBe(false);
    });
  });
  
  describe('handleError', () => {
    it('should log error details and return structured error response', async () => {
      const error = {
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        status: 429
      };
      
      const result = await LLMErrorHandler.handleError(error, mockSession);
      
      // Verify result structure
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe(true);
      expect(parsed.message).toBe('Rate limit exceeded');
      expect(parsed.userMessage).toContain('rate limit');
    });
    
    it('should handle different error status codes with appropriate messages', async () => {
      const testCases = [
        { status: 400, expectMessage: 'improperly formatted' },
        { status: 401, expectMessage: 'Authentication failed' },
        { status: 404, expectMessage: 'not found' },
        { status: 422, expectMessage: 'process this input' },
        { status: 429, expectMessage: 'rate limit' },
        { status: 500, expectMessage: 'issues' },
        { status: null, expectMessage: 'unexpected error' }
      ];
      
      for (const testCase of testCases) {
        const error = {
          message: 'Test error',
          status: testCase.status
        };
        
        const result = await LLMErrorHandler.handleError(error, mockSession);
        const parsed = JSON.parse(result);
        
        expect(parsed.userMessage).toContain(testCase.expectMessage);
      }
    });
  });
});
