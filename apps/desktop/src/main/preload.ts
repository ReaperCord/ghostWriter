import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ghostWriter", {
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  dispatchEvent: (event: { type: string }) =>
    ipcRenderer.invoke("dispatch-event", event),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  toggleStealth: () => ipcRenderer.invoke("toggle-stealth")
});


