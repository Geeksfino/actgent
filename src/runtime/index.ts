import { Runtime } from './types';
import { NodeRuntime } from './node';
import { TauriRuntime } from './tauri';

export function createRuntime(): Runtime {
  const isTauri = typeof window !== 'undefined' && window && '__TAURI__' in window;
  if (isTauri) {
    return new TauriRuntime();
  }
  return new NodeRuntime();
}

export * from './types';
export * from './errors'; 