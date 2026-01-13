export class TextBuffer {
  private chunks: string[] = [];

  append(text: string): void {
    this.chunks.push(text);
  }

  getFullText(): string {
    return this.chunks.join(" ");
  }

  getChunks(): string[] {
    return [...this.chunks];
  }

  clear(): void {
    this.chunks = [];
  }

  isEmpty(): boolean {
    return this.chunks.length === 0;
  }
}
