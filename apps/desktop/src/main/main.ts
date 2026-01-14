import { app, BrowserWindow, ipcMain, Menu } from "electron";
import * as path from "path";
import * as fs from "fs";
import { StateMachine } from "./state/StateMachine";
import { TextBuffer, Pipeline, NotesAgent, MeetingNotes } from "./cognitive";
import { NotesStorage } from "./persistence";
import { TranscriptionService } from "./transcription";

// Configurações do usuário (temporário - será persistido depois)
const userSettings = {
  stealthEnabled: false
};

// Referência global da janela principal
let mainWindow: BrowserWindow | null = null;

// Transcription Service
let transcriptionService: TranscriptionService | null = null;

// Cognitive Pipeline
const textBuffer = new TextBuffer();
const pipeline = new Pipeline();
const notesAgent = new NotesAgent();
const notesStorage = new NotesStorage();

// Estado das notas geradas (persiste entre estados)
let generatedNotes: MeetingNotes | null = null;

// Paths para os binários nativos
function getNativePaths() {
  const nativeDir = path.join(__dirname, "../../native");

  return {
    whisperExe: path.join(nativeDir, "whisper/whisper.exe"),
    whisperModel: path.join(nativeDir, "whisper/models/ggml-base.bin")
  };
}

// Inicia o serviço de transcrição real
function startTranscription() {
  const paths = getNativePaths();
  const tempDir = path.join(app.getPath("temp"), "ghostwriter-audio");

  console.log("[Transcription] Iniciando serviço...");
  console.log("[Transcription] Whisper:", paths.whisperExe);
  console.log("[Transcription] Modelo:", paths.whisperModel);
  console.log("[Transcription] Temp:", tempDir);
  console.log("[Transcription] Audio: WASAPI Loopback (captura do sistema)");

  transcriptionService = new TranscriptionService({
    whisperConfig: {
      executablePath: paths.whisperExe,
      modelPath: paths.whisperModel,
      language: "pt",
      threads: 4,
      timeoutMs: 30000
    },
    tempDirectory: tempDir,
    chunkDurationSeconds: 6
  });

  transcriptionService.start((transcription) => {
    // Formato: DD/MM/YYYY [HH:MM:SS -> HH:MM:SS]: texto
    const taggedText = `${transcription.formattedTimestamp}: ${transcription.text}`;
    console.log(`[Transcription] Chunk ${transcription.chunkIndex}: ${taggedText.substring(0, 80)}...`);

    textBuffer.append(taggedText);
    if (mainWindow) {
      mainWindow.webContents.send("transcription-update", textBuffer.getFullText());
    }
  });
}

// Para o serviço de transcrição
async function stopTranscription(): Promise<void> {
  if (transcriptionService) {
    console.log("[Transcription] Parando serviço...");
    await transcriptionService.stop();
    transcriptionService.cleanup();
    transcriptionService = null;
    console.log("[Transcription] Serviço parado");
  }
}

// StateMachine
const stateMachine = new StateMachine();

console.log("Estado inicial:", stateMachine.getState());

// IPC Handlers
ipcMain.handle("get-app-state", () => {
  return stateMachine.getState();
});

ipcMain.handle("get-settings", () => {
  return { stealthEnabled: userSettings.stealthEnabled };
});

ipcMain.handle("toggle-stealth", () => {
  userSettings.stealthEnabled = !userSettings.stealthEnabled;
  console.log("[Settings] Stealth mode:", userSettings.stealthEnabled ? "ON" : "OFF");

  if (mainWindow) {
    setStealth(mainWindow, userSettings.stealthEnabled);
  }

  return { stealthEnabled: userSettings.stealthEnabled };
});

ipcMain.handle("get-transcription", () => {
  return textBuffer.getFullText();
});

ipcMain.handle("get-generated-notes", () => {
  return generatedNotes;
});

ipcMain.handle("update-notes", (_event, notes: MeetingNotes) => {
  generatedNotes = notes;
  return generatedNotes;
});

ipcMain.handle("save-notes", async () => {
  if (generatedNotes) {
    const filePath = await notesStorage.save(generatedNotes);
    return { success: !!filePath, filePath };
  }
  return { success: false, filePath: null };
});

// IPC dispatch de eventos com ciclo de vida do pipeline
ipcMain.handle("dispatch-event", async (_event, stateEvent) => {
  const prev = stateMachine.getState();
  const next = stateMachine.dispatch(stateEvent);

  if (prev !== next) {
    // Redimensiona a janela para o novo estado
    resizeWindow(next);

    // Entrando em CAPTURING
    if (next === "CAPTURING") {
      textBuffer.clear();
      generatedNotes = null;
      startTranscription();
      if (mainWindow) setStealth(mainWindow, true);
    }

    // Saindo de CAPTURING para REVIEW
    if (prev === "CAPTURING" && next === "REVIEW") {
      await stopTranscription();

      // Processa o buffer e gera notas
      const rawText = textBuffer.getFullText();
      const processed = pipeline.process(rawText);
      generatedNotes = notesAgent.generate(processed);

      console.log("[Pipeline] Notas geradas:", generatedNotes);

      if (mainWindow) setStealth(mainWindow, userSettings.stealthEnabled);
    }

    // Saindo de REVIEW para IDLE
    if (prev === "REVIEW" && next === "IDLE") {
      textBuffer.clear();
      generatedNotes = null;
    }
  }

  return next;
});

// Stealth Mode - esconde da captura de tela, mas usuário sempre vê
function setStealth(win: BrowserWindow, enabled: boolean) {
  win.setContentProtection(enabled);
  console.log(
    "[Stealth]",
    enabled ? "ENABLED - hidden from screen capture" : "DISABLED - visible in screen capture"
  );
}

// Tamanhos da janela por estado
const WINDOW_SIZES = {
  IDLE: { width: 424, height: 320 },
  CAPTURING: { width: 424, height: 890 },
  REVIEW: { width: 424, height: 890 }
};

function resizeWindow(state: "IDLE" | "CAPTURING" | "REVIEW") {
  if (!mainWindow) return;
  const size = WINDOW_SIZES[state];
  mainWindow.setSize(size.width, size.height);
  mainWindow.setMaximumSize(size.width, size.height);
  mainWindow.setMinimumSize(size.width, size.height);
}

// UI
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZES.IDLE.width,
    height: WINDOW_SIZES.IDLE.height,
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // temporário
    }
  });

  const indexPath = path.resolve(__dirname, "../../index.html");

  console.log("Loading HTML from:", indexPath);

  mainWindow.loadFile(indexPath);

  mainWindow.webContents.on("did-finish-load", () => {
    console.log("HTML carregou com sucesso");

    if (mainWindow && userSettings.stealthEnabled) {
      setStealth(mainWindow, true);
    }
  });
}

app.whenReady().then(() => {
  // Remove a barra de menu padrão do Electron
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", async () => {
  await stopTranscription();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
