const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  getServerInfo: () => ipcRenderer.invoke("server:info"),
  copyText: (text) => ipcRenderer.invoke("clipboard:copy", text),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  onOpenUrl: (callback) => ipcRenderer.on("browser:open-url", (_event, url) => callback(url))
});
