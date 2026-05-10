const { contextBridge, clipboard } = require("electron");

contextBridge.exposeInMainWorld("miniBeam", {
  serverUrl: process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847",
  copy: (text) => clipboard.writeText(String(text || ""))
});
