const { contextBridge, clipboard, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  serverUrl: process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847",
  copy: (text) => clipboard.writeText(String(text || "")),
  browser: {
    navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
    back: () => ipcRenderer.invoke("browser:back"),
    forward: () => ipcRenderer.invoke("browser:forward"),
    reload: () => ipcRenderer.invoke("browser:reload"),
    getState: () => ipcRenderer.invoke("browser:state"),
    onEvent: (callback) => {
      ipcRenderer.on("browser:event", (_event, payload) => callback(payload));
    }
  }
});
