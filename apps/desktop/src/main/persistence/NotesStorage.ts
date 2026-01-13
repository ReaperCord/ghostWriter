import { dialog } from "electron";
import * as fs from "fs";
import { MeetingNotes } from "../cognitive/NotesAgent";

export class NotesStorage {
  async save(notes: MeetingNotes): Promise<string | null> {
    const filename = this.generateFilename();
    const content = this.toMarkdown(notes);

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, content, "utf-8");
      return filePath;
    }
    return null;
  }

  private generateFilename(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `meeting-notes-${date}-${hours}h${minutes}.md`;
  }

  private toMarkdown(notes: MeetingNotes): string {
    const keyPointsSection =
      notes.keyPoints.length > 0
        ? notes.keyPoints.map((p) => `- ${p}`).join("\n")
        : "- Nenhum ponto registrado";

    const decisionsSection =
      notes.decisions.length > 0
        ? notes.decisions.map((d) => `- ${d}`).join("\n")
        : "- Nenhuma decisão registrada";

    const actionItemsSection =
      notes.actionItems.length > 0
        ? notes.actionItems.map((a) => `- [ ] ${a}`).join("\n")
        : "- [ ] Nenhuma ação registrada";

    return `# Notas da Reunião - ${this.formatTimestamp(notes.timestamp)}

## Key Points
${keyPointsSection}

## Decisões
${decisionsSection}

## Ações
${actionItemsSection}
`;
  }

  private formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
}
