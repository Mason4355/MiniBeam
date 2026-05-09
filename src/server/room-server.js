const os = require("node:os");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");

function createRoomCode() {
  return `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }

  return "127.0.0.1";
}

function createRoomServer({ staticDir }) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const roomCode = createRoomCode();

  const room = {
    roomCode,
    browserUrl: "",
    participants: new Map(),
    messages: []
  };

  app.use(express.static(staticDir));
  app.get("/health", (_request, response) => {
    response.json({ ok: true, roomCode, participants: room.participants.size });
  });

  io.on("connection", (socket) => {
    const requestedRoom = socket.handshake.auth?.room || socket.handshake.query?.room;
    if (requestedRoom && requestedRoom !== roomCode) {
      socket.emit("room:error", "Комната не найдена");
      socket.disconnect(true);
      return;
    }

    const isHost = room.participants.size === 0 || socket.handshake.auth?.host === true;
    const participant = {
      id: socket.id,
      name: socket.handshake.auth?.name || (isHost ? "Host" : `Guest ${socket.id.slice(0, 4)}`),
      avatar: isHost ? "H" : socket.id.slice(0, 2).toUpperCase(),
      status: isHost ? "Хост" : "Подключён",
      isHost
    };

    room.participants.set(socket.id, participant);
    socket.join(roomCode);
    socket.emit("room:state", serializeRoom(room, socket.id));
    io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));

    socket.on("browser:navigate", (url) => {
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) return;
      room.browserUrl = normalizedUrl;
      participant.status = isHost ? "Управляет" : "Смотрит";
      socket.to(roomCode).emit("browser:navigate", normalizedUrl);
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });

    socket.on("chat:message", (message) => {
      const text = String(message || "").trim().slice(0, 600);
      if (!text) return;

      const entry = {
        id: `${Date.now()}-${socket.id}`,
        authorId: socket.id,
        author: participant.name,
        text,
        createdAt: new Date().toISOString()
      };

      room.messages.push(entry);
      room.messages = room.messages.slice(-120);
      io.to(roomCode).emit("chat:message", entry);
    });

    socket.on("disconnect", () => {
      room.participants.delete(socket.id);
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });
  });

  return {
    roomCode,
    async start(port = 0) {
      await new Promise((resolve) => httpServer.listen(port, "0.0.0.0", resolve));
      const address = httpServer.address();
      const actualPort = typeof address === "object" ? address.port : port;
      const lanAddress = getLanAddress();

      return {
        port: actualPort,
        roomCode,
        localUrl: `http://127.0.0.1:${actualPort}/?room=${roomCode}`,
        lanUrl: `http://${lanAddress}:${actualPort}/?room=${roomCode}`
      };
    },
    async stop() {
      io.close();
      await new Promise((resolve) => httpServer.close(resolve));
    }
  };
}

function serializeRoom(room, selfId) {
  return {
    roomCode: room.roomCode,
    browserUrl: room.browserUrl,
    participants: Array.from(room.participants.values()),
    messages: room.messages,
    selfId
  };
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(".") && !text.includes(" ")) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

module.exports = { createRoomServer, normalizeUrl };
