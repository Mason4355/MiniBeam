const express = require("express");
const http = require("node:http");
const os = require("node:os");
const { Server } = require("socket.io");

const PORT = Number(process.env.MINIBEAM_PORT || 3847);
const ROOM_CODE = process.env.MINIBEAM_ROOM || `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
const DEFAULT_URL = "https://duckduckgo.com";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const room = {
  code: ROOM_CODE,
  activeTabId: "tab-1",
  tabs: [
    createTabState("tab-1", DEFAULT_URL, "New tab", true)
  ],
  participants: new Map(),
  messages: []
};

let guestCounter = 1;

app.use(express.static(__dirname));
app.get("/health", (_req, res) => {
  res.json({ ok: true, roomCode: room.code, state: publicRoomState() });
});

io.on("connection", (socket) => {
  socket.on("room:join", (profile = {}) => joinRoom(socket, profile));
  socket.on("room:leave", () => leaveRoom(socket));

  socket.on("tab:create", (payload = {}) => createTab(socket, payload.url));
  socket.on("tab:close", (payload = {}) => closeTab(socket, payload.tabId));
  socket.on("tab:switch", (payload = {}) => switchTab(socket, payload.tabId));
  socket.on("tab:updateURL", (payload = {}) => updateTabUrl(socket, payload));

  socket.on("chat:message", (text) => addMessage(socket, text));
  socket.on("disconnect", () => leaveRoom(socket));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  const lan = getLanAddress();
  console.log("");
  console.log("MiniBeam server is running");
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
    online: true,
    role: room.participants.size === 0 ? "host" : "viewer"
  };
  room.participants.set(socket.id, participant);
  socket.emit("room:state", publicRoomState(socket.id));
  io.to(room.code).emit("participants:update", Array.from(room.participants.values()));
}

function leaveRoom(socket) {
  if (!room.participants.has(socket.id)) return;
  room.participants.delete(socket.id);
  socket.leave(room.code);
  io.to(room.code).emit("participants:update", Array.from(room.participants.values()));
}

function createTab(socket, rawUrl) {
  const tab = createTabState(`tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`, normalizeUrl(rawUrl) || DEFAULT_URL, "New tab", true);
  room.tabs.forEach((item) => {
    item.active = false;
  });
  room.tabs.push(tab);
  room.activeTabId = tab.id;
  io.to(room.code).emit("tab:create", { tab, activeTabId: room.activeTabId, sourceId: socket.id });
}

function closeTab(socket, tabId) {
  if (room.tabs.length <= 1) return;
  const index = room.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const wasActive = room.tabs[index].id === room.activeTabId;
  const [closedTab] = room.tabs.splice(index, 1);
  if (wasActive) {
    const next = room.tabs[Math.max(0, index - 1)];
    room.activeTabId = next.id;
  }
  markActiveTab();
  io.to(room.code).emit("tab:close", { tabId: closedTab.id, activeTabId: room.activeTabId, tabs: publicTabs(), sourceId: socket.id });
}

function switchTab(socket, tabId) {
  const tab = getTab(tabId);
  if (!tab) return;
  room.activeTabId = tab.id;
  markActiveTab();
  io.to(room.code).emit("tab:switch", { tabId: tab.id, activeTabId: room.activeTabId, tabs: publicTabs(), sourceId: socket.id });
}

function updateTabUrl(socket, payload) {
  const tab = getTab(payload.tabId) || getActiveTab();
  const url = normalizeUrl(payload.url);
  if (!tab || !url) return;

  tab.url = url;
  tab.title = String(payload.title || getTitleFromUrl(url)).slice(0, 140);

  if (tab.history[tab.historyIndex] !== url) {
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(url);
    tab.historyIndex = tab.history.length - 1;
  }

  io.to(room.code).emit("tab:updateURL", {
    tab: publicTab(tab),
    activeTabId: room.activeTabId,
    tabs: publicTabs(),
    sourceId: socket.id
  });
}

function addMessage(socket, text) {
  const body = String(text || "").trim().slice(0, 600);
  if (!body) return;
  const message = {
    id: `${Date.now()}-${socket.id}`,
    author: room.participants.get(socket.id)?.name || "Guest",
    text: body,
    createdAt: new Date().toISOString()
  };
  room.messages.push(message);
  if (room.messages.length > 100) room.messages.shift();
  io.to(room.code).emit("chat:message", message);
}

function publicRoomState(selfId = "") {
  return {
    roomCode: room.code,
    selfId,
    activeTabId: room.activeTabId,
    tabs: publicTabs(),
    participants: Array.from(room.participants.values()),
    messages: room.messages
  };
}

function publicTabs() {
  return room.tabs.map(publicTab);
}

function publicTab(tab) {
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.id === room.activeTabId,
    history: [...tab.history],
    historyIndex: tab.historyIndex
  };
}

function createTabState(id, url, title, active = false) {
  return {
    id,
    url,
    title: title || getTitleFromUrl(url),
    active,
    history: [url],
    historyIndex: 0
  };
}

function getActiveTab() {
  return getTab(room.activeTabId) || room.tabs[0];
}

function getTab(tabId) {
  return room.tabs.find((tab) => tab.id === tabId);
}

function markActiveTab() {
  room.tabs.forEach((tab) => {
    tab.active = tab.id === room.activeTabId;
  });
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
    return new URL(url).hostname.replace(/^www\./, "") || "New tab";
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
