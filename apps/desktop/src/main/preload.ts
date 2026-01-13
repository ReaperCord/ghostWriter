import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ghostWriter", {
  getAppState: () => ipcRenderer.invoke("get-app-state")
});
