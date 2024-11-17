import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TauriRuntime } from '../tauri';
import { RuntimeError } from '../errors';
import type { SpawnResult } from '../types';

// Mock the Tauri modules
const mockCommand = {
  create: mock((...args: any[]) => ({
    execute: mock(() => Promise.resolve({ stdout: '', stderr: '', code: 0 }))
  }))
};

const mockFS = {
  readTextFile: mock((path: string) => Promise.resolve('')),
  writeTextFile: mock((path: string, content: string) => Promise.resolve()),
  exists: mock((path: string) => Promise.resolve(true)),
  mkdir: mock((path: string) => Promise.resolve()),
  readDir: mock((path: string) => Promise.resolve([])),
  remove: mock((path: string) => Promise.resolve()),
};

const mockOS = {
  platform: mock(() => Promise.resolve('linux')),
  arch: mock(() => Promise.resolve('x64')),
  type: mock(() => Promise.resolve('Darwin')),
  version: mock(() => Promise.resolve('1.0.0')),
  hostname: mock(() => Promise.resolve('localhost')),
};

// Mock the imports
mock.module('@tauri-apps/plugin-shell', () => ({
  Command: mockCommand
}));

mock.module('@tauri-apps/plugin-fs', () => mockFS);

mock.module('@tauri-apps/plugin-os', () => mockOS);

mock.module('@tauri-apps/api/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  basename: (path: string) => path.split('/').pop() || '',
  extname: (path: string) => {
    const base = path.split('/').pop() || '';
    const dotIndex = base.lastIndexOf('.');
    return dotIndex === -1 ? '' : base.slice(dotIndex);
  },
  normalize: (path: string) => path.replace(/\/+/g, '/'),
  isAbsolute: (path: string) => path.startsWith('/'),
}));

describe('TauriRuntime', () => {
  let runtime: TauriRuntime;

  beforeEach(() => {
    runtime = new TauriRuntime();
    // Reset mock call counts
    mockCommand.create.mockClear();
    Object.values(mockFS).forEach(mockFn => mockFn.mockClear());
    Object.values(mockOS).forEach(mockFn => mockFn.mockClear());
  });

  describe('FileSystem', () => {
    it('should read and write files', async () => {
      const testPath = '/test/path/test.txt';
      const testContent = 'Hello, World!';

      mockFS.writeTextFile.mockImplementation(() => Promise.resolve());
      mockFS.readTextFile.mockImplementation(() => Promise.resolve(testContent));

      await runtime.fs.writeFile(testPath, testContent);
      const content = await runtime.fs.readFile(testPath);

      expect(mockFS.writeTextFile).toHaveBeenCalledWith(testPath, testContent);
      expect(mockFS.readTextFile).toHaveBeenCalledWith(testPath);
      expect(content).toBe(testContent);
    });

    it('should handle file stats', async () => {
      const testPath = '/test/path/test.txt';
      mockFS.exists.mockImplementation(() => Promise.resolve(true));

      const stats = await runtime.fs.stat(testPath);

      expect(mockFS.exists).toHaveBeenCalledWith(testPath);
      expect(stats.isFile).toBe(true);
    });

    it('should throw RuntimeError for non-existent files', async () => {
      mockFS.exists.mockImplementation(() => Promise.resolve(false));

      await expect(runtime.fs.stat('nonexistent.txt'))
        .rejects
        .toThrow('File not found');
    });
  });

  describe('Process', () => {
    it('should get current working directory', async () => {
      const expectedCwd = '/current/working/dir';
      mockCommand.create.mockImplementation(() => ({
        execute: mock(() => Promise.resolve({ stdout: expectedCwd + '\n', stderr: '', code: 0 }))
      }));

      const cwd = await runtime.process.cwd();
      expect(cwd).toBe(expectedCwd);
    });

    it('should handle environment variables on Unix-like systems', async () => {
      const testKey = 'TEST_ENV_VAR';
      const testValue = 'test_value';

      mockOS.platform.mockImplementation(() => Promise.resolve('linux'));
      mockCommand.create.mockImplementation(() => ({
        execute: mock(() => Promise.resolve({ stdout: testValue + '\n', stderr: '', code: 0 }))
      }));

      await runtime.process.setEnvironmentVariable(testKey, testValue);
      const value = await runtime.process.getEnvironmentVariable(testKey);

      expect(value).toBe(testValue);
      expect(mockCommand.create).toHaveBeenCalledWith('sh', ['-c', `export ${testKey}="${testValue}"`]);
    });

    it('should handle environment variables on Windows', async () => {
      const testKey = 'TEST_ENV_VAR';
      const testValue = 'test_value';

      mockOS.platform.mockImplementation(() => Promise.resolve('windows'));
      mockCommand.create.mockImplementation(() => ({
        execute: mock(() => Promise.resolve({ stdout: testValue + '\n', stderr: '', code: 0 }))
      }));

      await runtime.process.setEnvironmentVariable(testKey, testValue);
      const value = await runtime.process.getEnvironmentVariable(testKey);

      expect(value).toBe(testValue);
      expect(mockCommand.create).toHaveBeenCalledWith('cmd', ['/c', `set "${testKey}=${testValue}"`]);
    });
  });

  describe('ChildProcess', () => {
    it('should execute commands', async () => {
      const expectedOutput = 'test output';
      mockCommand.create.mockImplementation(() => ({
        execute: mock(() => Promise.resolve({ stdout: expectedOutput, stderr: '', code: 0 }))
      }));

      const { stdout } = await runtime.childProcess.exec('echo "test"');
      expect(stdout).toBe(expectedOutput);
    });

    it('should spawn processes', async () => {
      const expectedOutput = 'test output';
      mockCommand.create.mockImplementation(() => ({
        execute: mock(() => Promise.resolve({ stdout: expectedOutput, stderr: '', code: 0 }))
      }));

      const result = await runtime.childProcess.spawn('echo', ['test']);
      expect(result.stdout).toBe(expectedOutput);
      expect(result.exitCode).toBe(0);
    });
  });
});
