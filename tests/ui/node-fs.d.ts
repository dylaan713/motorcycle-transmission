// Minimal declaration: @types/node is not an allowed dependency; tests only read files.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
  export function readdirSync(path: URL | string, options: { recursive: true }): string[];
}
