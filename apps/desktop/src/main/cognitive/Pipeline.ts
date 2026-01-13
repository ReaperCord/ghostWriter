export interface ProcessedText {
  cleanText: string;
  decisions: string[];
  actionItems: string[];
  keyPoints: string[];
}

// Fillers comuns em português que devem ser removidos
const FILLERS = [
  "ah",
  "tipo",
  "né",
  "então",
  "assim",
  "ué",
  "hum",
  "éh",
  "ahn",
  "bom",
  "olha",
  "veja",
  "sabe"
];

// Padrões para detectar decisões
const DECISION_PATTERNS = [
  /\b(decidimos|decidido|decisão|vamos fazer|ficou definido|ficou decidido|optamos|escolhemos)\b/i,
  /\b(será|serão|vai ser|vão ser)\s+\w+/i
];

// Padrões para detectar tarefas/ações
const ACTION_PATTERNS = [
  /\b(tarefa|preciso|precisamos|fazer|implementar|criar|resolver|ação|todo|pendente)\b/i,
  /\b(vai\s+\w+ar|vou\s+\w+ar|vamos\s+\w+ar)\b/i,
  /\b(responsável|encarregado|ficou\s+de)\b/i
];

// Padrões para detectar pontos importantes
const KEY_POINT_PATTERNS = [
  /\b(importante|essencial|crítico|fundamental|principal|destaque|relevante)\b/i,
  /\b(problema|issue|bug|erro|falha)\b/i,
  /\b(solução|resolver|corrigir|fix)\b/i,
  /\b(prazo|deadline|entrega|data)\b/i
];

export class Pipeline {
  process(rawText: string): ProcessedText {
    const sentences = this.splitSentences(rawText);
    const cleanedSentences = sentences.map((s) => this.removeFillersFromSentence(s));

    const decisions: string[] = [];
    const actionItems: string[] = [];
    const keyPoints: string[] = [];

    for (const sentence of cleanedSentences) {
      if (this.isDecision(sentence)) {
        decisions.push(sentence.trim());
      }

      if (this.isActionItem(sentence)) {
        actionItems.push(sentence.trim());
      }

      if (this.isKeyPoint(sentence) && !this.isSmallTalk(sentence)) {
        keyPoints.push(sentence.trim());
      }
    }

    return {
      cleanText: cleanedSentences.join(" ").trim(),
      decisions: this.deduplicate(decisions),
      actionItems: this.deduplicate(actionItems),
      keyPoints: this.deduplicate(keyPoints)
    };
  }

  private splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private removeFillersFromSentence(sentence: string): string {
    let result = sentence;

    for (const filler of FILLERS) {
      // Remove fillers no início, meio e fim da frase
      const pattern = new RegExp(`\\b${filler}\\b[,]?\\s*`, "gi");
      result = result.replace(pattern, "");
    }

    // Remove espaços duplos
    return result.replace(/\s+/g, " ").trim();
  }

  private isDecision(sentence: string): boolean {
    return DECISION_PATTERNS.some((pattern) => pattern.test(sentence));
  }

  private isActionItem(sentence: string): boolean {
    return ACTION_PATTERNS.some((pattern) => pattern.test(sentence));
  }

  private isKeyPoint(sentence: string): boolean {
    // Frases longas são provavelmente importantes
    if (sentence.split(" ").length >= 8) {
      return true;
    }

    return KEY_POINT_PATTERNS.some((pattern) => pattern.test(sentence));
  }

  private isSmallTalk(sentence: string): boolean {
    const smallTalkPatterns = [
      /\b(bom dia|boa tarde|boa noite|tudo bem|como vai|olá|oi)\b/i,
      /\b(até mais|tchau|falou|valeu)\b/i
    ];

    return smallTalkPatterns.some((pattern) => pattern.test(sentence));
  }

  private deduplicate(items: string[]): string[] {
    return [...new Set(items)];
  }
}
