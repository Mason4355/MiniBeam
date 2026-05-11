const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { app, BrowserView, BrowserWindow, Menu, ipcMain, session } = require("electron");

const runtimeDir = path.join(os.tmpdir(), `MiniBeamClient-${process.pid}`);
const serverUrl = process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847";
const viewPartitionPrefix = `minibeam-${process.pid}`;

let mainWindow;
let activeTabId = "";
let browserBounds = { x: 0, y: 74, width: 950, height: 604 };
const views = new Map();
const adBlockedSessions = new WeakSet();

const blockedDomains = [
  "2mdn.net",
  "adform.net",
  "adnxs.com",
  "adsafeprotected.com",
  "adsrvr.org",
  "amazon-adsystem.com",
  "analytics.google.com",
  "app-measurement.com",
  "bluekai.com",
  "chartbeat.com",
  "criteo.com",
  "criteo.net",
  "doubleclick.net",
  "facebook.net",
  "google-analytics.com",
  "googleadservices.com",
  "googlesyndication.com",
  "googletagmanager.com",
  "googletagservices.com",
  "hotjar.com",
  "moatads.com",
  "outbrain.com",
  "scorecardresearch.com",
  "taboola.com",
  "yandexadexchange.net"
];

const blockedUrlPatterns = [
  /(^|[/?&_.-])adserver([/?&_.-]|$)/i,
  /(^|[/?&_.-])ads?[/?&_.-]/i,
  /(^|[/?&_.-])banner(s)?[/?&_.-]/i,
  /(^|[/?&_.-])prebid([/?&_.-]|$)/i,
  /(^|[/?&_.-])tracking([/?&_.-]|$)/i,
  /(^|[/?&_.-])utm_pixel([/?&_.-]|$)/i
];

fs.mkdirSync(runtimeDir, { recursive: true });
app.setPath("userData", runtimeDir);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", cleanup);

async function createWindow() {
  Menu.setApplicationMenu(null);
  installAdBlock(session.defaultSession);

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
  mainWindow.on("resize", updateActiveViewBounds);
  mainWindow.on("maximize", updateActiveViewBounds);
  mainWindow.on("unmaximize", updateActiveViewBounds);
  mainWindow.on("leave-full-screen", () => {
    sendBrowserEvent("html-fullscreen", { fullscreen: false });
    updateActiveViewBounds();
  });
}

ipcMain.handle("tabs:sync", async (_event, tabs = [], nextActiveTabId = "") => {
  const knownIds = new Set(tabs.map((tab) => tab.id));
  for (const [tabId, view] of views.entries()) {
    if (!knownIds.has(tabId)) {
      try {
        if (mainWindow?.getBrowserView() === view) mainWindow.setBrowserView(null);
        view.webContents.close({ waitForBeforeUnload: false });
      } catch {}
      views.delete(tabId);
    }
  }

  for (const tab of tabs) {
    const view = ensureView(tab);
    const currentUrl = view.webContents.getURL();
    if (tab.url && currentUrl !== tab.url) {
      try {
        await view.webContents.loadURL(tab.url);
      } catch {}
    }
  }

  if (nextActiveTabId) setActiveView(nextActiveTabId);
});

ipcMain.handle("browser:navigate", async (_event, tabId, url) => {
  const view = views.get(tabId || activeTabId);
  if (!view || !url) return;
  await view.webContents.loadURL(url);
});

ipcMain.handle("browser:back", () => {
  const view = views.get(activeTabId);
  if (view?.webContents.canGoBack()) view.webContents.goBack();
});

ipcMain.handle("browser:forward", () => {
  const view = views.get(activeTabId);
  if (view?.webContents.canGoForward()) view.webContents.goForward();
});

ipcMain.handle("browser:reload", () => {
  views.get(activeTabId)?.webContents.reload();
});

ipcMain.handle("layout:set-browser-bounds", (_event, nextBounds = {}) => {
  const scale = mainWindow?.webContents.getZoomFactor() || 1;
  browserBounds = {
    x: Math.max(0, Math.round(Number(nextBounds.x || 0) * scale)),
    y: Math.max(0, Math.round(Number(nextBounds.y || 0) * scale)),
    width: Math.max(320, Math.round(Number(nextBounds.width || 320) * scale)),
    height: Math.max(240, Math.round(Number(nextBounds.height || 240) * scale))
  };
  updateActiveViewBounds();
});

function ensureView(tab) {
  if (views.has(tab.id)) return views.get(tab.id);

  const partition = `${viewPartitionPrefix}-${tab.id}`;
  const viewSession = session.fromPartition(partition);
  installAdBlock(viewSession);

  const view = new BrowserView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      plugins: true
    }
  });

  view.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  view.webContents.setWindowOpenHandler(({ url }) => {
    sendBrowserEvent("new-window", { tabId: tab.id, url });
    return { action: "deny" };
  });

  view.webContents.on("enter-html-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      sendBrowserEvent("html-fullscreen", { fullscreen: true });
      setTimeout(updateActiveViewBounds, 120);
    }
  });
  view.webContents.on("leave-html-full-screen", () => {
    sendBrowserEvent("html-fullscreen", { fullscreen: false });
    setTimeout(updateActiveViewBounds, 120);
  });
  view.webContents.on("did-start-loading", () => sendBrowserEvent("loading", { tabId: tab.id, loading: true }));
  view.webContents.on("did-stop-loading", () => {
    sendBrowserEvent("loading", { tabId: tab.id, loading: false });
    sendNavigationState(tab.id);
  });
  view.webContents.on("did-navigate", (_event, url) => reportNavigation(tab.id, url));
  view.webContents.on("did-navigate-in-page", (_event, url) => reportNavigation(tab.id, url));
  view.webContents.on("page-title-updated", (_event, title) => {
    sendBrowserEvent("title", { tabId: tab.id, title, url: view.webContents.getURL() });
  });

  views.set(tab.id, view);
  return view;
}

function setActiveView(tabId) {
  const view = views.get(tabId);
  if (!mainWindow || !view) return;
  activeTabId = tabId;
  mainWindow.setBrowserView(view);
  updateActiveViewBounds();
  sendNavigationState(tabId);
}

function updateActiveViewBounds() {
  const view = views.get(activeTabId);
  if (!mainWindow || !view) return;
  view.setBounds(browserBounds);
  view.setAutoResize({ width: true, height: true });
}

function installAdBlock(targetSession) {
  if (!targetSession || adBlockedSessions.has(targetSession)) return;
  adBlockedSessions.add(targetSession);

  targetSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (shouldBlockRequest(details.url, details.resourceType)) {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });
}

function shouldBlockRequest(rawUrl, resourceType) {
  if (resourceType === "mainFrame") return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const domainBlocked = blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (domainBlocked) return true;

  if (resourceType === "media") return false;
  const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return blockedUrlPatterns.some((pattern) => pattern.test(pathAndQuery));
}

function reportNavigation(tabId, url) {
  const view = views.get(tabId);
  sendBrowserEvent("navigated", { tabId, url, title: view?.webContents.getTitle() || "" });
  sendNavigationState(tabId);
}

function sendNavigationState(tabId) {
  const view = views.get(tabId);
  sendBrowserEvent("navigation-state", {
    tabId,
    canGoBack: view?.webContents.canGoBack() || false,
    canGoForward: view?.webContents.canGoForward() || false
  });
}

function sendBrowserEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browser:event", { type, ...payload });
}

async function cleanup() {
  for (const view of views.values()) {
    try {
      view.webContents.stop();
      view.webContents.close({ waitForBeforeUnload: false });
    } catch {}
  }
  views.clear();
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
  } catch {}
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  } catch {}
}
