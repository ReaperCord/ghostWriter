import { app, BrowserWindow } from "electron";
import path from "path";

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600, 
    
    // TODO: ajustar segurança e CSP antes de produção

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
