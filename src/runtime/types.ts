/**
 * Core runtime types for cross-platform compatibility
 */

export interface FileStat {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
}

export interface CPUInfo {
  model: string;
  speed: number;
  times: {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  };
}

export interface NetworkInterface {
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid?: number;
}

export interface NetworkInterfaces {
  [key: string]: NetworkInterface[];
}

export type BufferEncoding = 'ascii' | 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'base64url' | 'latin1' | 'binary' | 'hex';

export interface FileSystem {
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string, encoding?: BufferEncoding): Promise<void>;
  readDir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<FileStat>;
  watch(path: string, callback: (event: string, filename: string | null) => void): void;
}

export interface Path {
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
  isAbsolute(path: string): boolean;
  normalize(path: string): string;
  relative(from: string, to: string): string;
}

export interface OS {
  platform(): Promise<string>;
  homedir(): Promise<string>;
  tmpdir(): Promise<string>;
  hostname(): Promise<string>;
  cpus(): Promise<Array<CPUInfo>>;
  totalmem(): Promise<number>;
  freemem(): Promise<number>;
  arch(): Promise<string>;
  type(): Promise<string>;
  release(): Promise<string>;
  networkInterfaces(): Promise<NetworkInterfaces>;
}

export interface Process {
  env: Record<string, string | undefined>;
  cwd(): Promise<string>;
  exit(code?: number): void;
  readonly pid: number;
  readonly platform: string;
  readonly argv: string[];
  readonly execPath: string;
  getEnvironmentVariable(key: string): Promise<string | null>;
  setEnvironmentVariable(key: string, value: string): Promise<void>;
}

export interface ChildProcess {
  exec(command: string): Promise<{ stdout: string; stderr: string }>;
  spawn(command: string, args: string[]): Promise<SpawnResult>;
  execFile(file: string, args: string[]): Promise<{ stdout: string; stderr: string }>;
}

export interface SpawnResult {
  pid: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface Runtime {
  fs: FileSystem;
  path: Path;
  os: OS;
  process: Process;
  childProcess: ChildProcess;
}