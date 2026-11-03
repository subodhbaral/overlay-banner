declare module 'm3u8-parser' {
  export class Parser {
    manifest: unknown;
    push(chunk: string): void;
    end(): void;
  }
}
