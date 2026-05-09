const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  getServerInfo: () => ipcRenderer.invoke("server:info"),
  copyText: (text) => ipcRenderer.invoke("clipboard:copy", text),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  onOpenUrl: (callback) => ipcRenderer.on("browser:open-url", (_event, url) => callback(url)),
  browserNavigate: (url) => ipcRenderer.invoke("native-browser:navigate", url),
  browserHome: () => ipcRenderer.invoke("native-browser:home"),
  browserBack: () => ipcRenderer.invoke("native-browser:back"),
  browserForward: () => ipcRenderer.invoke("native-browser:forward"),
  browserReload: () => ipcRenderer.invoke("native-browser:reload"),
  browserZoom: (zoomFactor) => ipcRenderer.invoke("native-browser:zoom", zoomFactor),
  onBrowserEvent: (callback) => ipcRenderer.on("native-browser:event", (_event, payload) => callback(payload))
});
