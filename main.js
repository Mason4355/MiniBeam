const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { app, BrowserView, BrowserWindow, ipcMain, session } = require("electron");

const runtimeDir = path.join(os.tmpdir(), `MiniBeamClient-${process.pid}`);
const serverUrl = process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847";

let mainWindow;
let browserView;
let isQuitting = false;

fs.mkdirSync(runtimeDir, { recursive: true });
app.setPath("userData", runtimeDir);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.whenReady().then(createWindow);

app.on("window-all-closed", () => app.quit());

app.on("before-quit", async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  await cleanup();
  app.exit(0);
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1120,
    minHeight: 680,
    title: "MiniBeam",
    backgroundColor: "#111217",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
  createBrowserView();
  mainWindow.on("resize", updateBrowserBounds);
  mainWindow.on("maximize", updateBrowserBounds);
  mainWindow.on("unmaximize", updateBrowserBounds);
}

function createBrowserView() {
  browserView = new BrowserView({
    webPreferences: {
      partition: `minibeam-browser-${process.pid}`,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      plugins: true
    }
  });

  mainWindow.setBrowserView(browserView);
  updateBrowserBounds();

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
    sendNavigationState();
  });
  browserView.webContents.on("did-navigate", (_event, url) => reportNavigation(url));
  browserView.webContents.on("did-navigate-in-page", (_event, url) => reportNavigation(url));
  browserView.webContents.on("page-title-updated", (_event, title) => {
    sendBrowserEvent("title", { title, url: browserView.webContents.getURL() });
  });
  browserView.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      sendBrowserEvent("error", { errorDescription, url: validatedURL });
    }
  });

  browserView.webContents.loadURL("https://duckduckgo.com");
}

function updateBrowserBounds() {
  if (!mainWindow || !browserView) return;
  const [width, height] = mainWindow.getContentSize();
  const rightPanel = width <= 1100 ? 290 : 330;
  const topChrome = 74;
  const bottomStatus = 42;

  browserView.setBounds({
    x: 0,
    y: topChrome,
    width: Math.max(320, width - rightPanel),
    height: Math.max(240, height - topChrome - bottomStatus)
  });
  browserView.setAutoResize({ width: true, height: true });
}

ipcMain.handle("browser:navigate", async (_event, url) => {
  if (!browserView || !url) return;
  await browserView.webContents.loadURL(url);
});

ipcMain.handle("browser:back", () => {
  if (browserView?.webContents.canGoBack()) browserView.webContents.goBack();
});

ipcMain.handle("browser:forward", () => {
  if (browserView?.webContents.canGoForward()) browserView.webContents.goForward();
});

ipcMain.handle("browser:reload", () => {
  if (browserView) browserView.webContents.reload();
});

ipcMain.handle("browser:state", () => ({
  url: browserView?.webContents.getURL() || "",
  title: browserView?.webContents.getTitle() || "New tab",
  canGoBack: browserView?.webContents.canGoBack() || false,
  canGoForward: browserView?.webContents.canGoForward() || false
}));

function reportNavigation(url) {
  sendBrowserEvent("navigated", { url, title: browserView.webContents.getTitle() || "" });
  sendNavigationState();
}

function sendNavigationState() {
  sendBrowserEvent("navigation-state", {
    canGoBack: browserView?.webContents.canGoBack() || false,
    canGoForward: browserView?.webContents.canGoForward() || false
  });
}

function sendBrowserEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browser:event", { type, ...payload });
}

async function cleanup() {
  if (browserView) {
    try {
      browserView.webContents.stop();
      browserView.webContents.close({ waitForBeforeUnload: false });
      mainWindow?.setBrowserView(null);
    } catch {}
    browserView = null;
  }
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
  } catch {}
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  } catch {}
}
