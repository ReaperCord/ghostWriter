/**
 * TextBuffer.ts
 *
 * Buffer para armazenar chunks de texto transcrito.
 * Cada chunk representa uma transcricao de um segmento de audio.
 *
 * @module cognitive
 */

/**
 * Buffer de texto para armazenar transcricoes.
 *
 * Armazena chunks de texto separadamente, permitindo:
 * - Adicionar novos chunks conforme sao transcritos
 * - Obter todo o texto concatenado
 * - Obter chunks individuais para processamento
 * - Limpar o buffer para nova sessao
 *
 * Os chunks sao separados por duas quebras de linha (\n\n)
 * para formar paragrafos distintos na UI.
 *
 * @example
 * ```typescript
 * const buffer = new TextBuffer();
 *
 * buffer.append("Primeira frase transcrita.");
 * buffer.append("Segunda frase transcrita.");
 *
 * console.log(buffer.getFullText());
 * // "Primeira frase transcrita.\n\nSegunda frase transcrita."
 *
 * buffer.clear();
 * console.log(buffer.isEmpty()); // true
 * ```
 */
export class TextBuffer {
  /** Array interno de chunks de texto */
  private chunks: string[] = [];

  /**
   * Adiciona um novo chunk de texto ao buffer.
   *
   * @param text - Texto a ser adicionado
   */
  append(text: string): void {
    this.chunks.push(text);
  }

  /**
   * Retorna todo o texto concatenado.
   *
   * Os chunks sao unidos com duas quebras de linha (\n\n)
   * para formar paragrafos separados.
   *
   * @returns Texto completo do buffer
   */
  getFullText(): string {
    return this.chunks.join("\n\n");
  }

  /**
   * Retorna uma copia do array de chunks.
   *
   * Util para processar chunks individualmente
   * (ex: gerar notas estruturadas por chunk).
   *
   * @returns Array de chunks (copia)
   */
  getChunks(): string[] {
    return [...this.chunks];
  }

  /**
   * Limpa o buffer, removendo todos os chunks.
   *
   * Deve ser chamado ao iniciar uma nova sessao de captura.
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * Verifica se o buffer esta vazio.
   *
   * @returns true se nao ha chunks no buffer
   */
  isEmpty(): boolean {
    return this.chunks.length === 0;
  }
}
