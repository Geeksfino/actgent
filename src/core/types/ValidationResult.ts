export type ValidationResult<T> = {
  isValid: boolean;
  data: T | null;
  error?: string;
  originalContent?: string;
};

export type ValidationLevel = 'strict' | 'lenient' | 'none';

export interface ValidationOptions {
  level: ValidationLevel;
  allowPartialMatch?: boolean;
  requireMessageType?: boolean;
} 