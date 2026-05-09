const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  getServerInfo: () => ipcRenderer.invoke("app:server-info"),
  copy: (text) => ipcRenderer.invoke("app:copy", text)
});
