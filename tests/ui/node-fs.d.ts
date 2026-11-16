// Minimal declaration: @types/node is not an allowed dependency; tests only read one file.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
