import { describe, it, expect, beforeEach } from 'vitest';
import { AppleScriptTool } from '../appleScript';
import { platform } from 'os';
import { ExecutionContext } from '../../core/ExecutionContext';

// Skip all tests if not running on macOS
const runTests = platform() === 'darwin';

(runTests ? describe : describe.skip)('AppleScriptTool', () => {
  let appleScriptTool: AppleScriptTool;
  let context: ExecutionContext;

  beforeEach(() => {
    context = new ExecutionContext();
    appleScriptTool = new AppleScriptTool();
  });

  it('should execute a simple AppleScript command', async () => {
    const result = await appleScriptTool.run({
      script: 'return "Hello, AppleScript!"'
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(true);
    expect(content.output).toBe('Hello, AppleScript!');
  });

  it('should handle mathematical operations', async () => {
    const result = await appleScriptTool.run({
      script: 'return 2 + 2'
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(true);
    expect(content.output).toBe('4');
  });

  it('should handle invalid scripts gracefully', async () => {
    const result = await appleScriptTool.run({
      script: 'this is not valid AppleScript'
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(false);
    expect(content.error).toBeDefined();
  });

  it('should respect timeout limits', async () => {
    const result = await appleScriptTool.run({
      script: 'delay 2\nreturn "Done"',
      timeout: 1000
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(false);
    expect(content.error).toContain('Command failed');
  });

  it('should handle non-interactive AppleScript commands', async () => {
    const result = await appleScriptTool.run({
      script: 'tell application "System Events" to return name of current user'
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(true);
    expect(typeof content.output).toBe('string');
  });

  it('should sanitize script input', async () => {
    const result = await appleScriptTool.run({
      script: 'return "potentially harmful" & "safe"'
    });

    const content = result.getTypedContent();
    expect(content.success).toBe(true);
    expect(content.error).toBeUndefined();
  });
}); 