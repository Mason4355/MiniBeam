if (process.argv.includes("--host")) {
  require("../host/host-main");
} else {
  const path = require("node:path");
  const { app, BrowserWindow, clipboard, ipcMain } = require("electron");

  let mainWindow;
  let isQuitting = false;

  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

  app.whenReady().then(async () => {
    await createWindow();
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", async (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    await shutdown();
    app.exit(0);
  });

  async function shutdown() {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  }

  async function createWindow() {
    const serverUrl = getServerUrl();

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 1120,
      minHeight: 680,
      title: "MiniBeam",
      backgroundColor: "#0b0811",
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    await mainWindow.loadURL(serverUrl);
  }

  ipcMain.handle("app:server-info", () => {
    const serverUrl = getServerUrl();
    return { roomCode: "", localUrl: serverUrl, lanUrl: serverUrl };
  });

  ipcMain.handle("app:copy", (_event, text) => {
    clipboard.writeText(String(text || ""));
  });

  function getServerUrl() {
    return process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847";
  }
}
