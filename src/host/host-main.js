const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const express = require("express");
const http = require("node:http");
const { app, BrowserWindow, session } = require("electron");
const { Server } = require("socket.io");
const { normalizeUrl } = require("../server/room-server");

const port = Number(process.env.MINIBEAM_PORT || 3847);
const roomCode = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
const staticDir = path.join(__dirname, "..", "renderer");
const browserPartition = "minibeam-host-browser";
const runtimeDir = path.join(os.tmpdir(), `MiniBeamHost-${process.pid}`);

let browserWindow;
let httpServer;
let io;
let currentUrl = "";
let currentTitle = "New tab";
let blockedCount = 0;
let lastFrame = "";
let frameTimer;
let guestCounter = 1;
const participants = new Map();
const messages = [];

fs.mkdirSync(runtimeDir, { recursive: true });
app.setPath("userData", runtimeDir);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-crash-reporter");
app.disableHardwareAcceleration();

app.whenReady().then(startHost);

app.on("before-quit", async () => {
  clearInterval(frameTimer);
  if (browserWindow && !browserWindow.isDestroyed()) browserWindow.destroy();
  if (io) io.close();
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  try {
    const browserSession = session.fromPartition(browserPartition);
    await browserSession.clearCache();
    await browserSession.clearStorageData();
  } catch {}
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  } catch {}
});

async function startHost() {
  installAdBlocker(session.fromPartition(browserPartition));
  createBrowser();
  await startServer();
  printInfo();
}

function createBrowser() {
  browserWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      partition: browserPartition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      offscreen: true
    }
  });

  browserWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldBlockUrl(url, "popup")) {
      blockedCount += 1;
      emitState();
      return { action: "deny" };
    }
    navigate(url);
    return { action: "deny" };
  });

  browserWindow.webContents.on("did-navigate", (_event, url) => {
    currentUrl = url;
    emitState();
  });
  browserWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    currentUrl = url;
    emitState();
  });
  browserWindow.webContents.on("page-title-updated", (_event, title) => {
    currentTitle = title || "New tab";
    emitState();
  });
  browserWindow.webContents.on("did-start-loading", () => emitState({ loading: true }));
  browserWindow.webContents.on("did-stop-loading", () => emitState({ loading: false }));
  browserWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) emitState({ error: errorDescription, url: validatedURL });
  });

  frameTimer = setInterval(captureFrame, 120);
}

async function startServer() {
  const appServer = express();
  httpServer = http.createServer(appServer);
  io = new Server(httpServer, { cors: { origin: "*" } });

  appServer.use(express.static(staticDir));
  appServer.get("/health", (_request, response) => {
    response.json({ ok: true, roomCode, url: currentUrl, title: currentTitle });
  });

  io.on("connection", (socket) => {
    participants.set(socket.id, {
      id: socket.id,
      name: `Guest ${guestCounter++}`,
      status: participants.size === 0 ? "Хост ведёт показ" : "Смотрит"
    });
    emitRoomState(socket.id);
    if (lastFrame) socket.emit("browser:frame", lastFrame);
    emitState();

    socket.on("browser:navigate", navigate);
    socket.on("browser:back", () => {
      if (browserWindow.webContents.canGoBack()) browserWindow.webContents.goBack();
    });
    socket.on("browser:forward", () => {
      if (browserWindow.webContents.canGoForward()) browserWindow.webContents.goForward();
    });
    socket.on("browser:reload", () => browserWindow.webContents.reload());
    socket.on("browser:input", (event) => sendInput(event));
    socket.on("chat:message", (text) => {
      const message = {
        id: `${Date.now()}-${socket.id}`,
        author: participants.get(socket.id)?.name || "Guest",
        text: String(text || "").slice(0, 600),
        createdAt: new Date().toISOString()
      };
      messages.push(message);
      if (messages.length > 80) messages.shift();
      io.emit("chat:message", message);
    });
    socket.on("disconnect", () => {
      participants.delete(socket.id);
      emitRoomState();
    });
  });

  await new Promise((resolve) => httpServer.listen(port, "0.0.0.0", resolve));
}

function emitRoomState(selfId = "") {
  if (!io) return;
  io.emit("room:state", {
    roomCode,
    browserUrl: currentUrl,
    title: currentTitle,
    blockedCount,
    participants: Array.from(participants.values()),
    messages,
    selfId
  });
}

async function navigate(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return;
  currentUrl = url;
  emitState({ loading: true });
  await browserWindow.webContents.loadURL(url);
}

function sendInput(event) {
  if (!event || !browserWindow) return;
  if (event.type === "mouse") {
    browserWindow.webContents.sendInputEvent({
      type: event.eventType,
      x: Math.round(event.x),
      y: Math.round(event.y),
      button: event.button || "left",
      clickCount: event.clickCount || 1,
      movementX: 0,
      movementY: 0
    });
  }
  if (event.type === "wheel") {
    browserWindow.webContents.sendInputEvent({
      type: "mouseWheel",
      x: Math.round(event.x),
      y: Math.round(event.y),
      deltaY: Math.round(event.deltaY),
      deltaX: Math.round(event.deltaX || 0)
    });
  }
  if (event.type === "key") {
    browserWindow.webContents.sendInputEvent({
      type: event.eventType,
      keyCode: event.key
    });
  }
}

async function captureFrame() {
  if (!browserWindow || !io) return;
  try {
    const image = await browserWindow.webContents.capturePage();
    lastFrame = image.resize({ width: 1280 }).toJPEG(72).toString("base64");
    io.emit("browser:frame", lastFrame);
  } catch {}
}

function emitState(extra = {}) {
  if (!io) return;
  io.emit("browser:state", {
    url: currentUrl,
    title: currentTitle,
    blockedCount,
    canGoBack: browserWindow?.webContents.canGoBack() || false,
    canGoForward: browserWindow?.webContents.canGoForward() || false,
    ...extra
  });
}

function printInfo() {
  const lan = getLanAddress();
  console.log("");
  console.log("MiniBeam host server is running");
  console.log(`Room code: ${roomCode}`);
  console.log(`Local: http://127.0.0.1:${port}/?room=${roomCode}`);
  console.log(`LAN:   http://${lan}:${port}/?room=${roomCode}`);
  console.log("");
}

function getLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "127.0.0.1";
}

function installAdBlocker(targetSession) {
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    const blocked = shouldBlockUrl(details.url, details.resourceType);
    if (blocked) {
      blockedCount += 1;
      emitState();
    }
    callback({ cancel: blocked });
  });
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
  "adservice.google",
  "adnxs.com",
  "taboola.com",
  "outbrain.com",
  "mgid.com",
  "criteo.com",
  "popads.net",
  "propellerads.com",
  "onclickads.net",
  "realsrv.com",
  "adsterra.com",
  "adfox.ru",
  "adriver.ru",
  "mc.yandex.ru",
  "an.yandex.ru"
];

const AD_PATTERNS = [
  "/ads/",
  "/advert",
  "/banner",
  "/banners",
  "/vast",
  "/vpaid",
  "/popunder",
  "/clickunder",
  "/counter",
  "/analytics",
  "/tracking",
  "adfox",
  "adriver",
  "googleads",
  "yandex_rtb"
];
