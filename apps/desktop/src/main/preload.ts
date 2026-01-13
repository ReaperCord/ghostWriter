import { contextBridge, ipcRenderer } from "electron";

export interface MeetingNotes {
  timestamp: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
}

contextBridge.exposeInMainWorld("ghostWriter", {
  getAppState: () => ipcRenderer.invoke("get-app-state"),
  dispatchEvent: (event: { type: string }) => ipcRenderer.invoke("dispatch-event", event),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  toggleStealth: () => ipcRenderer.invoke("toggle-stealth"),
  getTranscription: () => ipcRenderer.invoke("get-transcription"),
  getGeneratedNotes: () => ipcRenderer.invoke("get-generated-notes"),
  updateNotes: (notes: MeetingNotes) => ipcRenderer.invoke("update-notes", notes),
  saveNotes: () => ipcRenderer.invoke("save-notes"),
  onTranscriptionUpdate: (callback: (text: string) => void) => {
    ipcRenderer.on("transcription-update", (_event, text) => callback(text));
  }
});
