import { app, BrowserWindow, ipcMain, Menu } from "electron";
import * as path from "path";
import { StateMachine } from "./state/StateMachine";
import { NullAudioCapture } from "./audio/NullAudioCapture";
import { TextBuffer, Pipeline, NotesAgent, MeetingNotes } from "./cognitive";
import { NotesStorage } from "./persistence";

// Configurações do usuário (temporário - será persistido depois)
const userSettings = {
  stealthEnabled: true
};

// Referência global da janela principal
let mainWindow: BrowserWindow | null = null;

// Audio
const audioCapture = new NullAudioCapture();

// Cognitive Pipeline
const textBuffer = new TextBuffer();
const pipeline = new Pipeline();
const notesAgent = new NotesAgent();
const notesStorage = new NotesStorage();

// Estado das notas geradas (persiste entre estados)
let generatedNotes: MeetingNotes | null = null;

// Simulação de transcrição
let simulationInterval: NodeJS.Timeout | null = null;

const SIMULATED_CHUNKS = [
  "Bom, vamos começar a reunião de hoje.",
  "Ah, tipo, precisamos resolver o bug do login que está afetando os usuários.",
  "Decidimos usar JWT para autenticação em vez de sessions.",
  "Tarefa: João vai implementar o endpoint de refresh token até sexta.",
  "A entrega do MVP ficou para o dia 15, é um prazo importante.",
  "Temos um problema crítico com a performance do dashboard.",
  "Optamos por usar Redis para cache das queries mais pesadas.",
  "Maria ficou responsável por criar os testes de integração.",
  "É fundamental que a documentação seja atualizada antes do release."
];

function startSimulation() {
  let chunkIndex = 0;

  simulationInterval = setInterval(() => {
    if (chunkIndex < SIMULATED_CHUNKS.length && mainWindow) {
      textBuffer.append(SIMULATED_CHUNKS[chunkIndex]);
      mainWindow.webContents.send("transcription-update", textBuffer.getFullText());
      chunkIndex++;
    } else if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
  }, 2000);
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
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
ipcMain.handle("dispatch-event", (_event, stateEvent) => {
  const prev = stateMachine.getState();
  const next = stateMachine.dispatch(stateEvent);

  if (prev !== next) {
    // Redimensiona a janela para o novo estado
    resizeWindow(next);

    // Entrando em CAPTURING
    if (next === "CAPTURING") {
      audioCapture.start();
      textBuffer.clear();
      generatedNotes = null;
      startSimulation();
      if (mainWindow) setStealth(mainWindow, true);
    }

    // Saindo de CAPTURING para REVIEW
    if (prev === "CAPTURING" && next === "REVIEW") {
      audioCapture.stop();
      stopSimulation();

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

app.on("window-all-closed", () => {
  stopSimulation();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
