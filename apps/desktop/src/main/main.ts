import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { StateMachine } from "./state/StateMachine";
import { NullAudioCapture } from "./audio/NullAudioCapture";

// Configurações do usuário (temporário - será persistido depois)
const userSettings = {
  stealthEnabled: true
};

// Referência global da janela principal
let mainWindow: BrowserWindow | null = null;

// Audio
const audioCapture = new NullAudioCapture();


//stateMachine
const stateMachine = new StateMachine();

console.log("Estado inicial:", stateMachine.getState());

ipcMain.handle("get-app-state", () => {
  return stateMachine.getState();
});

ipcMain.handle("get-settings", () => {
  return { stealthEnabled: userSettings.stealthEnabled };
});

ipcMain.handle("toggle-stealth", () => {
  userSettings.stealthEnabled = !userSettings.stealthEnabled;
  console.log("[Settings] Stealth mode:", userSettings.stealthEnabled ? "ON" : "OFF");

  // Aplica stealth imediatamente (esconde/mostra janela)
  if (mainWindow) {
    setStealth(mainWindow, userSettings.stealthEnabled);
  }

  return { stealthEnabled: userSettings.stealthEnabled };
});

//IPC captura de audio
ipcMain.handle("dispatch-event", (_event, stateEvent) => {
  const prev = stateMachine.getState();
  const next = stateMachine.dispatch(stateEvent);

  if (prev !== next) {
    if (next === "CAPTURING") {
      audioCapture.start();
      if (mainWindow) setStealth(mainWindow, true);
    }

    if (prev === "CAPTURING" && next !== "CAPTURING") {
      audioCapture.stop();
      if (mainWindow) setStealth(mainWindow, userSettings.stealthEnabled);
    }
  }

  return next;
});

//Stealth Mode - esconde da captura de tela, mas usuário sempre vê
function setStealth(win: BrowserWindow, enabled: boolean) {
  win.setContentProtection(enabled);
  console.log("[Stealth]", enabled ? "ENABLED - hidden from screen capture" : "DISABLED - visible in screen capture");
}


//UI
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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

    // Aplica stealth na inicialização se estiver ativo
    if (mainWindow && userSettings.stealthEnabled) {
      setStealth(mainWindow, true);
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


//Audio
