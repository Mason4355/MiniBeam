const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { createMiniBeamServer } = require("../server/server");

let mainWindow;
let miniBeamServer;
let serverInfo;

async function createWindow() {
  const staticDir = path.join(__dirname, "..", "renderer");
  miniBeamServer = createMiniBeamServer({ staticDir });
  serverInfo = await miniBeamServer.start(0);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 640,
    title: "MiniBeam",
    backgroundColor: "#090b12",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  await mainWindow.loadURL(serverInfo.localUrl);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async (event) => {
  if (!miniBeamServer) return;

  event.preventDefault();
  const server = miniBeamServer;
  miniBeamServer = null;
  await server.stop();
  app.exit(0);
});

ipcMain.handle("server:info", () => serverInfo);

ipcMain.handle("clipboard:copy", async (_event, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(String(text || ""));
  return true;
});

ipcMain.handle("external:open", async (_event, url) => {
  await shell.openExternal(url);
});
