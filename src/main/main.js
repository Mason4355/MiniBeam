const fs = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserView, BrowserWindow, ipcMain, session } = require("electron");
const { normalizeUrl } = require("../server/room-server");

const BROWSER_PARTITION = "persist:minibeam-browser";

let mainWindow;
let browserView;
let browserVisible = false;
let zoomFactor = 1;
let blockedCount = 0;
let isQuitting = false;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.whenReady().then(async () => {
  installAdBlocker(session.fromPartition(BROWSER_PARTITION));
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
  if (browserView) {
    try {
      browserView.webContents.stop();
      browserView.webContents.close({ waitForBeforeUnload: false });
    } catch {}
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setBrowserView(null);
      } catch {}
    }
    browserView = null;
    browserVisible = false;
  }

  try {
    await session.fromPartition(BROWSER_PARTITION).clearCache();
    await session.fromPartition(BROWSER_PARTITION).clearStorageData({
      storages: ["appcache", "cookies", "filesystem", "indexdb", "localstorage", "shadercache", "websql", "serviceworkers", "cachestorage"]
    });
  } catch {}

  await cleanupRuntimeTrash();
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
  createBrowserView();
  mainWindow.on("resize", updateBrowserBounds);
  mainWindow.on("maximize", updateBrowserBounds);
  mainWindow.on("unmaximize", updateBrowserBounds);
}

function createBrowserView() {
  if (browserView) return;

  browserView = new BrowserView({
    webPreferences: {
      partition: BROWSER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true
    }
  });

  browserView.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldBlockUrl(url, "popup")) {
      notifyBlocked(url);
      return { action: "deny" };
    }
    sendBrowserEvent("new-window", { url });
    return { action: "deny" };
  });

  browserView.webContents.on("did-start-loading", () => sendBrowserEvent("loading", { loading: true }));
  browserView.webContents.on("did-stop-loading", () => {
    sendBrowserEvent("loading", { loading: false });
    sendNavigationState();
  });
  browserView.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    sendBrowserEvent("load-error", { errorDescription, url: validatedURL });
  });
  browserView.webContents.on("did-navigate", (_event, url) => {
    sendBrowserEvent("navigated", { url });
    sendNavigationState();
  });
  browserView.webContents.on("did-navigate-in-page", (_event, url) => {
    sendBrowserEvent("navigated", { url });
    sendNavigationState();
  });
  browserView.webContents.on("page-title-updated", (_event, title) => sendBrowserEvent("title", { title }));
}

ipcMain.handle("app:server-info", () => {
  const serverUrl = getServerUrl();
  return { roomCode: "", localUrl: serverUrl, lanUrl: serverUrl };
});
ipcMain.handle("app:copy", (_event, text) => {
  require("electron").clipboard.writeText(String(text || ""));
});

ipcMain.handle("browser:navigate", async (_event, rawUrl) => {
  const url = normalizeUrl(rawUrl);
  if (!url) return;
  showBrowser();
  await browserView.webContents.loadURL(url);
});

ipcMain.handle("browser:home", () => hideBrowser());
ipcMain.handle("browser:back", () => {
  if (browserView?.webContents.canGoBack()) browserView.webContents.goBack();
});
ipcMain.handle("browser:forward", () => {
  if (browserView?.webContents.canGoForward()) browserView.webContents.goForward();
});
ipcMain.handle("browser:reload", () => {
  if (browserView) browserView.webContents.reload();
});
ipcMain.handle("browser:zoom", (_event, value) => {
  zoomFactor = Math.min(1.4, Math.max(0.7, Number(value) || 1));
  if (browserView) browserView.webContents.setZoomFactor(zoomFactor);
});

function showBrowser() {
  if (!mainWindow || !browserView) return;
  if (!browserVisible) {
    mainWindow.setBrowserView(browserView);
    browserVisible = true;
  }
  browserView.webContents.setZoomFactor(zoomFactor);
  updateBrowserBounds();
}

function hideBrowser() {
  if (!mainWindow || !browserVisible) return;
  mainWindow.setBrowserView(null);
  browserVisible = false;
}

function updateBrowserBounds() {
  if (!mainWindow || !browserView || !browserVisible) return;
  const [width, height] = mainWindow.getContentSize();
  const compact = width < 1180;
  const leftRail = compact ? 64 : 72;
  const rightPanel = compact ? 284 : 320;
  const topbar = 60;
  const browserTabs = 42;
  const browserToolbar = 54;

  browserView.setBounds({
    x: leftRail,
    y: topbar + browserTabs + browserToolbar,
    width: Math.max(320, width - leftRail - rightPanel),
    height: Math.max(240, height - topbar - browserTabs - browserToolbar)
  });
  browserView.setAutoResize({ width: true, height: true });
}

function getServerUrl() {
  return process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847";
}

function sendNavigationState() {
  sendBrowserEvent("navigation-state", {
    canGoBack: Boolean(browserView?.webContents.canGoBack()),
    canGoForward: Boolean(browserView?.webContents.canGoForward())
  });
}

function sendBrowserEvent(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:event", { type, ...payload });
  }
}

function installAdBlocker(targetSession) {
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    const blocked = shouldBlockUrl(details.url, details.resourceType);
    if (blocked) notifyBlocked(details.url);
    callback({ cancel: blocked });
  });
}

async function cleanupRuntimeTrash() {
  const tempDir = path.join(app.getPath("temp"), "MiniBeam");
  const candidates = [
    path.join(app.getPath("userData"), "Cache"),
    path.join(app.getPath("userData"), "Code Cache"),
    path.join(app.getPath("userData"), "GPUCache"),
    tempDir
  ];

  for (const target of candidates) {
    try {
      await fs.rm(target, { recursive: true, force: true });
    } catch {}
  }
}

function notifyBlocked(url) {
  blockedCount += 1;
  sendBrowserEvent("adblock", { count: blockedCount, url });
}

function shouldBlockUrl(rawUrl, resourceType = "") {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  if (resourceType === "mainFrame") return false;

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const target = `${host}${parsed.pathname}${parsed.search}`.toLowerCase();

  return AD_HOSTS.some((item) => host === item || host.endsWith(`.${item}`) || host.includes(item)) ||
    AD_PATTERNS.some((item) => target.includes(item));
}

const AD_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "adservice.google",
  "adnxs.com",
  "adsafeprotected.com",
  "scorecardresearch.com",
  "taboola.com",
  "outbrain.com",
  "mgid.com",
  "criteo.com",
  "rubiconproject.com",
  "pubmatic.com",
  "openx.net",
  "smartadserver.com",
  "adform.net",
  "bidswitch.net",
  "exoclick.com",
  "popads.net",
  "propellerads.com",
  "onclickads.net",
  "realsrv.com",
  "hilltopads.net",
  "adsterra.com",
  "clickadu.com",
  "popcash.net",
  "ad.mail.ru",
  "top.mail.ru",
  "an.yandex.ru",
  "mc.yandex.ru",
  "adfox.ru",
  "adriver.ru",
  "mytarget.ru",
  "betweendigital.com",
  "buzzoola.com",
  "relap.io",
  "jivosite.com"
];

const AD_PATTERNS = [
  "/ads/",
  "/advert",
  "/banner",
  "/banners",
  "/prebid",
  "/vast",
  "/vpaid",
  "/preroll",
  "/popunder",
  "/clickunder",
  "/counter",
  "/analytics",
  "/tracking",
  "adfox",
  "adriver",
  "yandex_rtb",
  "googleads"
];
