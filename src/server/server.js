const os = require("node:os");
const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");

function createRoomCode() {
  return `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getLanAddress() {
  const networks = os.networkInterfaces();

  for (const addresses of Object.values(networks)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return "127.0.0.1";
}

function createParticipant(socket, isHost) {
  const fallbackName = isHost ? "Host" : `Guest ${socket.id.slice(0, 4)}`;

  return {
    id: socket.id,
    name: socket.handshake.auth?.name || fallbackName,
    avatar: socket.handshake.auth?.avatar || fallbackName.slice(0, 2).toUpperCase(),
    status: isHost ? "Хост ведёт показ" : "Пауза",
    isHost
  };
}

function createMiniBeamServer(options = {}) {
  const roomCode = options.roomCode || createRoomCode();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });

  const room = {
    code: roomCode,
    browserUrl: "",
    videoUrl: "",
    isPlaying: false,
    currentTime: 0,
    volume: 0.85,
    updatedAt: Date.now(),
    participants: new Map(),
    messages: []
  };

  app.use(express.static(options.staticDir));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      roomCode,
      participants: room.participants.size
    });
  });

  io.on("connection", (socket) => {
    const requestedRoom = socket.handshake.auth?.room || socket.handshake.query?.room;

    if (requestedRoom && requestedRoom !== roomCode) {
      socket.emit("room:error", "Комната не найдена");
      socket.disconnect(true);
      return;
    }

    const isHost = room.participants.size === 0 || socket.handshake.auth?.host === true;
    const participant = createParticipant(socket, isHost);

    room.participants.set(socket.id, participant);
    socket.join(roomCode);

    socket.emit("room:state", serializeRoom(room, socket.id));
    io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));

    socket.on("video:set", (videoUrl) => {
      room.videoUrl = String(videoUrl || "").trim();
      room.currentTime = 0;
      room.isPlaying = false;
      room.updatedAt = Date.now();
      updateStatus(socket.id, "Пауза");
      io.to(roomCode).emit("video:set", room.videoUrl);
      io.to(roomCode).emit("playback:update", playbackSnapshot(room));
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });

    socket.on("browser:navigate", (url) => {
      room.browserUrl = normalizeBrowserUrl(url);
      updateStatus(socket.id, participant.isHost ? "Host browsing" : "Watching");
      socket.to(roomCode).emit("browser:navigate", room.browserUrl);
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });

    socket.on("playback:event", (event) => {
      const type = event?.type;
      const currentTime = Number(event?.currentTime);
      const volume = Number(event?.volume);

      if (Number.isFinite(currentTime)) {
        room.currentTime = Math.max(0, currentTime);
      }

      if (Number.isFinite(volume)) {
        room.volume = Math.min(1, Math.max(0, volume));
      }

      if (type === "play") {
        room.isPlaying = true;
        updateStatus(socket.id, participant.isHost ? "Хост ведёт показ" : "Смотрит");
      }

      if (type === "pause") {
        room.isPlaying = false;
        updateStatus(socket.id, "Пауза");
      }

      if (type === "seek" || type === "volume") {
        updateStatus(socket.id, room.isPlaying ? "Смотрит" : "Пауза");
      }

      room.updatedAt = Date.now();
      socket.to(roomCode).emit("playback:update", playbackSnapshot(room, type));
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });

    socket.on("participant:status", (status) => {
      updateStatus(socket.id, String(status || "Пауза"));
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
      room.messages = room.messages.slice(-100);
      io.to(roomCode).emit("chat:message", entry);
    });

    socket.on("disconnect", () => {
      room.participants.delete(socket.id);
      io.to(roomCode).emit("participants:update", Array.from(room.participants.values()));
    });
  });

  function updateStatus(socketId, status) {
    const target = room.participants.get(socketId);
    if (target) {
      target.status = status;
    }
  }

  return {
    roomCode,
    async start(port = 0) {
      await new Promise((resolve) => {
        server.listen(port, "0.0.0.0", resolve);
      });

      const address = server.address();
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
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function serializeRoom(room, selfId) {
  return {
    code: room.code,
    browserUrl: room.browserUrl,
    videoUrl: room.videoUrl,
    playback: playbackSnapshot(room),
    participants: Array.from(room.participants.values()),
    messages: room.messages,
    selfId
  };
}

function normalizeBrowserUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.includes(".") && !value.includes(" ")) {
    return `https://${value}`;
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

function playbackSnapshot(room, type = "sync") {
  return {
    type,
    isPlaying: room.isPlaying,
    currentTime: room.currentTime,
    volume: room.volume,
    updatedAt: room.updatedAt
  };
}

module.exports = {
  createMiniBeamServer
};
