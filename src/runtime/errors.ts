export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly original?: unknown
  ) {
    super(message);
    this.name = 'RuntimeError';
  }
} 