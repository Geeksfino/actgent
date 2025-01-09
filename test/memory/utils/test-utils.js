// Debug flag that can be controlled via environment variable
export const DEBUG = process.env.DEBUG === 'true';
export function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}
