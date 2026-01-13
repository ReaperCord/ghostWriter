import { app, BrowserWindow } from "electron";
import path from "path";
import { StateMachine } from "./state/StateMachine";
import { ipcMain } from "electron";

const stateMachine = new StateMachine();

ipcMain.handle("get-app-state", () => {
  return stateMachine.getState();
});


console.log("Estado inicial:", stateMachine.getState());


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

  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
