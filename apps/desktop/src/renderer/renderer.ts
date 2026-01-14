export {};

type AppState = "IDLE" | "CAPTURING" | "REVIEW";
type Settings = { stealthEnabled: boolean };

interface MeetingNotes {
  timestamp: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
}

declare global {
  interface Window {
    ghostWriter: {
      getAppState: () => Promise<AppState>;
      dispatchEvent: (event: { type: string }) => Promise<AppState>;
      getSettings: () => Promise<Settings>;
      toggleStealth: () => Promise<Settings>;
      getTranscription: () => Promise<string>;
      getGeneratedNotes: () => Promise<MeetingNotes | null>;
      updateNotes: (notes: MeetingNotes) => Promise<MeetingNotes>;
      saveNotes: () => Promise<{ success: boolean; filePath: string | null }>;
      onTranscriptionUpdate: (callback: (text: string) => void) => void;
    };
  }
}

const root = document.getElementById("root")!;

// Estado local para edição
let editableNotes: MeetingNotes | null = null;
let currentTranscription = "";

// Listener para atualizações de transcrição em tempo real
window.ghostWriter.onTranscriptionUpdate((text) => {
  currentTranscription = text;
  updateTranscriptionDisplay();
});

function updateTranscriptionDisplay() {
  const transcriptionEl = document.getElementById("transcription-content");
  if (transcriptionEl) {
    // Preservar quebras de linha usando innerHTML com <br> ou <p>
    const formattedText = currentTranscription
      ? currentTranscription.split("\n\n").map(p => `<p class="transcription-paragraph">${p}</p>`).join("")
      : "<p class=\"transcription-placeholder\">Aguardando transcrição...</p>";

    transcriptionEl.innerHTML = formattedText;

    // Auto-scroll suave para o final (sempre mostra o texto mais recente)
    transcriptionEl.scrollTo({
      top: transcriptionEl.scrollHeight,
      behavior: "smooth"
    });
  }
}

async function render() {
  const state = await window.ghostWriter.getAppState();
  const settings = await window.ghostWriter.getSettings();

  let content = "";

  if (state === "IDLE") {
    content = renderIdleState(settings);
  } else if (state === "CAPTURING") {
    content = renderCapturingState();
  } else if (state === "REVIEW") {
    const notes = await window.ghostWriter.getGeneratedNotes();
    editableNotes = notes ? { ...notes } : null;
    content = renderReviewState(editableNotes);
  }

  root.innerHTML = content;
  wireEvents(state);
}

function renderIdleState(_settings: Settings): string {
  return `
    <div class="app-container">
      <div class="content idle-content">
        <div class="title-row">
          <h1 class="page-title">Bem-vindo</h1>
          <span class="state-badge idle">IDLE</span>
        </div>

        <div class="transcription-tray">
          <p class="idle-message">Inicie uma chamada para começar uma transcrição.</p>
          <p class="idle-message">Deixe as notas comigo, foque 100% na reunião.</p>
        </div>

        <div class="button-group">
          <button id="start" class="btn btn-outline">Manter transcrição</button>
          <button id="discard" class="btn btn-danger">Excluir transcrição</button>
        </div>
      </div>
    </div>
  `;
}

function renderCapturingState(): string {
  return `
    <div class="app-container">
      <div class="content capturing-content">
        <div class="title-row">
          <h1 class="page-title">Transcrição</h1>
          <span class="state-badge capturing">ESCUTANDO</span>
        </div>

        <div class="transcription-box">
          <div id="transcription-content" class="transcription-content">
            ${currentTranscription || "Aguardando transcrição..."}
          </div>
          <div class="transcription-status">
            <span class="status-icon">🎙</span>
            <span>Transcrevendo...</span>
          </div>
        </div>

        <div class="button-group">
          <button id="stop" class="btn btn-outline">Encerrar reunião</button>
        </div>
      </div>
    </div>
  `;
}

function renderReviewState(notes: MeetingNotes | null): string {
  const keyPoints = notes?.keyPoints || [];
  const decisions = notes?.decisions || [];
  const actionItems = notes?.actionItems || [];

  const renderSection = (title: string, icon: string, items: string[], id: string) => {
    if (items.length === 0) {
      return `
        <div class="notes-section">
          <h3>${icon} ${title}:</h3>
          <p class="empty-section">Nenhum item identificado</p>
        </div>
      `;
    }

    return `
      <div class="notes-section">
        <h3>${icon} ${title}:</h3>
        <div id="${id}" class="notes-items" contenteditable="true">
          ${items.map((item, i) => `<p class="note-item" data-index="${i}">${item}</p>`).join("")}
        </div>
      </div>
    `;
  };

  return `
    <div class="app-container">
      <div class="content review-content">
        <div class="title-row">
          <h1 class="page-title">Notas geradas da reunião</h1>
          <span class="state-badge review">REVISÃO</span>
        </div>

        <div class="notes-box">
          ${renderSection("Key points", "🔑", keyPoints, "keypoints-list")}
          ${renderSection("Decisões", "📋", decisions, "decisions-list")}
          ${renderSection("Ações", "✅", actionItems, "actions-list")}
        </div>

        <div class="button-group review-buttons">
          <button id="save" class="btn btn-outline">Manter transcrição</button>
          <button id="discard" class="btn btn-danger">Excluir transcrição</button>
        </div>
      </div>
    </div>
  `;
}

function wireEvents(state: AppState) {
  if (state === "IDLE") {
    // No estado IDLE, os botões são inativos (apenas visuais)
    // O usuário precisa iniciar uma reunião de outra forma ou podemos adicionar
    // um evento de clique na tray para iniciar
    document.querySelector(".transcription-tray")?.addEventListener("click", async () => {
      currentTranscription = "";
      await window.ghostWriter.dispatchEvent({ type: "START_MEETING" });
      render();
    });
  }

  if (state === "CAPTURING") {
    document.getElementById("stop")?.addEventListener("click", async () => {
      await window.ghostWriter.dispatchEvent({ type: "STOP_MEETING" });
      render();
    });
  }

  if (state === "REVIEW") {
    document.getElementById("save")?.addEventListener("click", async () => {
      // Coleta as edições antes de salvar
      collectEditedNotes();

      if (editableNotes) {
        await window.ghostWriter.updateNotes(editableNotes);
      }

      const result = await window.ghostWriter.saveNotes();

      if (result.success) {
        console.log("[UI] Notas salvas em:", result.filePath);
        await window.ghostWriter.dispatchEvent({ type: "SAVE_NOTES" });
        render();
      }
    });

    document.getElementById("discard")?.addEventListener("click", async () => {
      await window.ghostWriter.dispatchEvent({ type: "DISCARD_NOTES" });
      editableNotes = null;
      render();
    });
  }
}

function collectEditedNotes() {
  if (!editableNotes) return;

  const keyPointsEl = document.getElementById("keypoints-list");
  const decisionsEl = document.getElementById("decisions-list");
  const actionsEl = document.getElementById("actions-list");

  if (keyPointsEl) {
    editableNotes.keyPoints = extractItemsFromElement(keyPointsEl);
  }

  if (decisionsEl) {
    editableNotes.decisions = extractItemsFromElement(decisionsEl);
  }

  if (actionsEl) {
    editableNotes.actionItems = extractItemsFromElement(actionsEl);
  }
}

function extractItemsFromElement(el: HTMLElement): string[] {
  const items: string[] = [];
  const paragraphs = el.querySelectorAll("p.note-item");

  paragraphs.forEach((p) => {
    const text = p.textContent?.trim();
    if (text) {
      items.push(text);
    }
  });

  // Se não houver parágrafos, tenta extrair do texto direto
  if (items.length === 0) {
    const text = el.textContent?.trim();
    if (text) {
      items.push(...text.split("\n").filter((line) => line.trim()));
    }
  }

  return items;
}

render();
