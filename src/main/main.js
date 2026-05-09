const path = require("node:path");
const { app, BrowserView, BrowserWindow, ipcMain, shell } = require("electron");
const { createMiniBeamServer } = require("../server/server");

let mainWindow;
let browserView;
let miniBeamServer;
let serverInfo;
let browserVisible = false;
let browserZoom = 1;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

async function createWindow() {
  const staticDir = path.join(__dirname, "..", "renderer");
  miniBeamServer = createMiniBeamServer({ staticDir });
  serverInfo = await miniBeamServer.start(0);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1120,
    minHeight: 680,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send("browser:open-url", url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(serverInfo.localUrl);
  createNativeBrowserView();
  mainWindow.on("resize", updateBrowserBounds);
  mainWindow.on("maximize", updateBrowserBounds);
  mainWindow.on("unmaximize", updateBrowserBounds);
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

ipcMain.handle("native-browser:navigate", async (_event, url) => {
  if (!browserView) createNativeBrowserView();
  showBrowserView();
  await browserView.webContents.loadURL(url);
});

ipcMain.handle("native-browser:home", async () => {
  hideBrowserView();
});

ipcMain.handle("native-browser:back", () => {
  if (browserView?.webContents.canGoBack()) {
    browserView.webContents.goBack();
  }
});

ipcMain.handle("native-browser:forward", () => {
  if (browserView?.webContents.canGoForward()) {
    browserView.webContents.goForward();
  }
});

ipcMain.handle("native-browser:reload", () => {
  if (browserView) {
    browserView.webContents.reload();
  }
});

ipcMain.handle("native-browser:zoom", (_event, zoomFactor) => {
  browserZoom = Math.min(1.4, Math.max(0.7, Number(zoomFactor) || 1));
  if (browserView) {
    browserView.webContents.setZoomFactor(browserZoom);
  }
});

function createNativeBrowserView() {
  if (browserView || !mainWindow) return;

  browserView = new BrowserView({
    webPreferences: {
      partition: "persist:minibeam-room",
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  browserView.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    sendBrowserEvent("new-window", { url });
    return { action: "deny" };
  });

  browserView.webContents.on("did-start-loading", () => sendBrowserEvent("loading", { loading: true }));
  browserView.webContents.on("did-stop-loading", () => {
    sendBrowserEvent("loading", { loading: false });
    sendBrowserEvent("navigation-state", getNavigationState());
  });
  browserView.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    sendBrowserEvent("load-error", { errorDescription, url: validatedURL });
  });
  browserView.webContents.on("did-navigate", (_event, url) => {
    sendBrowserEvent("navigated", { url });
    sendBrowserEvent("navigation-state", getNavigationState());
  });
  browserView.webContents.on("did-navigate-in-page", (_event, url) => {
    sendBrowserEvent("navigated", { url });
    sendBrowserEvent("navigation-state", getNavigationState());
  });
  browserView.webContents.on("page-title-updated", (_event, title) => sendBrowserEvent("title", { title }));
}

function showBrowserView() {
  if (!browserView || !mainWindow || browserVisible) {
    updateBrowserBounds();
    return;
  }

  mainWindow.setBrowserView(browserView);
  browserVisible = true;
  browserView.webContents.setZoomFactor(browserZoom);
  updateBrowserBounds();
}

function hideBrowserView() {
  if (!mainWindow || !browserView || !browserVisible) return;
  mainWindow.setBrowserView(null);
  browserVisible = false;
}

function updateBrowserBounds() {
  if (!mainWindow || !browserView || !browserVisible) return;

  const [width, height] = mainWindow.getContentSize();
  const compact = width < 1180;
  const leftRail = compact ? 64 : 72;
  const rightPanel = compact ? 280 : 320;
  const topbar = 64;
  const tabs = 42;
  const toolbar = 56;
  const bottom = 54;

  browserView.setBounds({
    x: leftRail,
    y: topbar + tabs + toolbar,
    width: Math.max(240, width - leftRail - rightPanel),
    height: Math.max(180, height - topbar - tabs - toolbar - bottom)
  });
  browserView.setAutoResize({ width: true, height: true });
}

function sendBrowserEvent(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("native-browser:event", { type, ...payload });
  }
}

function getNavigationState() {
  if (!browserView) {
    return { canGoBack: false, canGoForward: false };
  }

  return {
    canGoBack: browserView.webContents.canGoBack(),
    canGoForward: browserView.webContents.canGoForward()
  };
}
