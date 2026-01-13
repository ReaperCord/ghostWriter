import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { StateMachine } from "./state/StateMachine";
import { NullAudioCapture } from "./audio/NullAudioCapture";

//audio
const audioCapture = new NullAudioCapture();


//stateMachine
const stateMachine = new StateMachine();

console.log("Estado inicial:", stateMachine.getState());

ipcMain.handle("get-app-state", () => {
  return stateMachine.getState();
});

//IPC captura de audio
ipcMain.handle("dispatch-event", (_event, stateEvent) => {
  const prev = stateMachine.getState();
  const next = stateMachine.dispatch(stateEvent);

  if (prev !== next) {
    if (next === "CAPTURING") {
      audioCapture.start();
    }

    if (prev === "CAPTURING" && next !== "CAPTURING") {
      audioCapture.stop();
    }
  }

  return next;
});



//UI
function createWindow() {
  const win = new BrowserWindow({
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

  win.loadFile(indexPath);

  win.webContents.on("did-finish-load", () => {
    console.log("HTML carregou com sucesso");
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


//Audio
