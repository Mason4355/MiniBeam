const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  getServerInfo: () => ipcRenderer.invoke("app:server-info"),
  copy: (text) => ipcRenderer.invoke("app:copy", text),
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  home: () => ipcRenderer.invoke("browser:home"),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  zoom: (value) => ipcRenderer.invoke("browser:zoom", value),
  onBrowserEvent: (callback) => ipcRenderer.on("browser:event", (_event, payload) => callback(payload))
});
