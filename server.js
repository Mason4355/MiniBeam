const express = require("express");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { Server } = require("socket.io");

const PORT = Number(process.env.MINIBEAM_PORT || 3847);
const ROOM_CODE = process.env.MINIBEAM_ROOM || `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const room = {
  code: ROOM_CODE,
  activeTabId: "tab-1",
  tabs: [
    {
      id: "tab-1",
      title: "New tab",
      url: "https://duckduckgo.com",
      history: ["https://duckduckgo.com"],
      historyIndex: 0,
      active: true
    }
  ],
  participants: new Map(),
  messages: []
};

let guestCounter = 1;

app.use(express.static(__dirname));
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    roomCode: room.code,
    state: publicRoomState()
  });
});

io.on("connection", (socket) => {
  socket.on("room:join", (profile = {}) => joinRoom(socket, profile));
  socket.on("room:leave", () => leaveRoom(socket));

  socket.on("browser:navigate", (payload = {}) => navigate(socket, payload.url));
  socket.on("browser:updateURL", (payload = {}) => updateUrl(socket, payload));
  socket.on("browser:back", () => moveHistory(socket, -1));
  socket.on("browser:forward", () => moveHistory(socket, 1));
  socket.on("browser:reload", () => {
    const tab = getActiveTab();
    io.to(room.code).emit("browser:reload", { sourceId: socket.id, tabId: tab.id, url: tab.url });
  });
  socket.on("browser:click", (payload = {}) => {
    socket.to(room.code).emit("browser:click", { ...payload, sourceId: socket.id });
  });
  socket.on("browser:input", (payload = {}) => {
    socket.to(room.code).emit("browser:input", { ...payload, sourceId: socket.id });
  });

  socket.on("browser:tab:new", () => createTab(socket));
  socket.on("browser:tab:switch", (payload = {}) => switchTab(socket, payload.tabId));
  socket.on("browser:tab:close", (payload = {}) => closeTab(socket, payload.tabId));

  socket.on("chat:message", (text) => addMessage(socket, text));
  socket.on("disconnect", () => leaveRoom(socket));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  const lan = getLanAddress();
  console.log("");
  console.log("MiniBeam local server is running");
  console.log(`Room:  ${ROOM_CODE}`);
  console.log(`Local: http://127.0.0.1:${PORT}`);
  console.log(`LAN:   http://${lan}:${PORT}`);
  console.log("");
});

function joinRoom(socket, profile) {
  socket.join(room.code);
  const participant = {
    id: socket.id,
    name: cleanName(profile.name) || `Guest ${guestCounter++}`,
    status: "online",
    role: room.participants.size === 0 ? "host" : "viewer"
  };
  room.participants.set(socket.id, participant);
  socket.emit("room:state", publicRoomState(socket.id));
  io.to(room.code).emit("room:participants", Array.from(room.participants.values()));
}

function leaveRoom(socket) {
  if (!room.participants.has(socket.id)) return;
  room.participants.delete(socket.id);
  socket.leave(room.code);
  io.to(room.code).emit("room:participants", Array.from(room.participants.values()));
}

function navigate(socket, rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return;
  const tab = getActiveTab();
  tab.url = url;
  tab.title = getTitleFromUrl(url);
  tab.history = tab.history.slice(0, tab.historyIndex + 1);
  tab.history.push(url);
  tab.historyIndex = tab.history.length - 1;
  emitBrowserState(socket.id, "navigate");
}

function updateUrl(socket, payload) {
  const url = normalizeUrl(payload.url);
  if (!url) return;
  const tab = getTab(payload.tabId) || getActiveTab();
  tab.url = url;
  tab.title = String(payload.title || getTitleFromUrl(url)).slice(0, 120);

  if (tab.history[tab.historyIndex] !== url) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
  }
  emitBrowserState(socket.id, "updateURL");
}

function moveHistory(socket, direction) {
  const tab = getActiveTab();
  const nextIndex = tab.historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= tab.history.length) return;
  tab.historyIndex = nextIndex;
  tab.url = tab.history[tab.historyIndex];
  tab.title = getTitleFromUrl(tab.url);
  emitBrowserState(socket.id, direction < 0 ? "back" : "forward");
}

function createTab(socket) {
  const tab = {
    id: `tab-${Date.now()}`,
    title: "New tab",
    url: "https://duckduckgo.com",
    history: ["https://duckduckgo.com"],
    historyIndex: 0,
    active: true
  };
  room.tabs.forEach((item) => {
    item.active = false;
  });
  room.tabs.push(tab);
  room.activeTabId = tab.id;
  emitBrowserState(socket.id, "tab:new");
}

function switchTab(socket, tabId) {
  const tab = getTab(tabId);
  if (!tab) return;
  room.activeTabId = tab.id;
  room.tabs.forEach((item) => {
    item.active = item.id === tab.id;
  });
  emitBrowserState(socket.id, "tab:switch");
}

function closeTab(socket, tabId) {
  if (room.tabs.length <= 1) return;
  const index = room.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const wasActive = room.tabs[index].active;
  room.tabs.splice(index, 1);
  if (wasActive) {
    const next = room.tabs[Math.max(0, index - 1)];
    room.activeTabId = next.id;
    next.active = true;
  }
  emitBrowserState(socket.id, "tab:close");
}

function addMessage(socket, text) {
  const body = String(text || "").trim().slice(0, 600);
  if (!body) return;
  const author = room.participants.get(socket.id)?.name || "Guest";
  const message = {
    id: `${Date.now()}-${socket.id}`,
    author,
    text: body,
    createdAt: new Date().toISOString()
  };
  room.messages.push(message);
  if (room.messages.length > 100) room.messages.shift();
  io.to(room.code).emit("chat:message", message);
}

function emitBrowserState(sourceId, reason) {
  io.to(room.code).emit("browser:state", {
    ...publicBrowserState(),
    sourceId,
    reason
  });
}

function publicRoomState(selfId = "") {
  return {
    roomCode: room.code,
    selfId,
    ...publicBrowserState(),
    participants: Array.from(room.participants.values()),
    messages: room.messages
  };
}

function publicBrowserState() {
  const activeTab = getActiveTab();
  return {
    activeTabId: room.activeTabId,
    url: activeTab.url,
    title: activeTab.title,
    tabs: room.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.id === room.activeTabId,
      canGoBack: tab.historyIndex > 0,
      canGoForward: tab.historyIndex < tab.history.length - 1
    }))
  };
}

function getActiveTab() {
  return getTab(room.activeTabId) || room.tabs[0];
}

function getTab(tabId) {
  return room.tabs.find((tab) => tab.id === tabId);
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(".") && !text.includes(" ")) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

function getTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || "New tab";
  } catch {
    return "New tab";
  }
}

function cleanName(value) {
  return String(value || "").trim().slice(0, 32);
}

function getLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "127.0.0.1";
}
