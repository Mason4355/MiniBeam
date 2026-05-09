const elements = {
  roomTitle: document.querySelector("#roomTitle"),
  serverUrl: document.querySelector("#serverUrl"),
  copyRoomButton: document.querySelector("#copyRoomButton"),
  participantCount: document.querySelector("#participantCount"),
  participants: document.querySelector("#participants"),
  videoForm: document.querySelector("#videoForm"),
  videoUrlInput: document.querySelector("#videoUrlInput"),
  videoPlayer: document.querySelector("#videoPlayer"),
  youtubeHost: document.querySelector("#youtubeHost"),
  emptyState: document.querySelector("#emptyState"),
  playPauseButton: document.querySelector("#playPauseButton"),
  seekControl: document.querySelector("#seekControl"),
  volumeControl: document.querySelector("#volumeControl"),
  timeLabel: document.querySelector("#timeLabel"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

const state = {
  roomCode: "",
  inviteUrl: "",
  socket: null,
  selfId: "",
  syncing: false,
  youtubeMode: false,
  youtubePlayer: null,
  youtubeReady: false,
  youtubeApiPromise: null,
  youtubeTimeTimer: null
};

bootstrap();

async function bootstrap() {
  const serverInfo = await window.miniBeam.getServerInfo();
  const params = new URLSearchParams(window.location.search);
  state.roomCode = params.get("room") || serverInfo.roomCode;
  state.inviteUrl = serverInfo.lanUrl;

  elements.roomTitle.textContent = `Комната ${state.roomCode}`;
  elements.serverUrl.textContent = serverInfo.lanUrl;

  const name = localStorage.getItem("minibeam:name") || createGuestName();
  localStorage.setItem("minibeam:name", name);

  state.socket = io({
    auth: {
      room: state.roomCode,
      name,
      host: window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    }
  });

  wireSocket();
  wireUi();
}

function wireSocket() {
  state.socket.on("room:error", (message) => {
    elements.emptyState.innerHTML = `<strong>Ошибка комнаты</strong><span>${escapeHtml(message)}</span>`;
  });

  state.socket.on("room:state", (room) => {
    state.selfId = room.selfId;
    renderParticipants(room.participants);
    renderMessages(room.messages);
    if (room.videoUrl) {
      loadVideo(room.videoUrl, false);
    }
    applyPlayback(room.playback);
  });

  state.socket.on("participants:update", renderParticipants);
  state.socket.on("video:set", (url) => loadVideo(url, false));
  state.socket.on("playback:update", applyPlayback);
  state.socket.on("chat:message", appendMessage);
}

function wireUi() {
  elements.copyRoomButton.addEventListener("click", async () => {
    await window.miniBeam.copyText(`${state.roomCode} ${state.inviteUrl}`);
    elements.copyRoomButton.textContent = "Скопировано";
    setTimeout(() => {
      elements.copyRoomButton.textContent = "Скопировать код";
    }, 1300);
  });

  elements.videoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = elements.videoUrlInput.value.trim();
    if (!url) return;
    loadVideo(url, true);
    state.socket.emit("video:set", url);
  });

  elements.playPauseButton.addEventListener("click", () => {
    if (state.youtubeMode) {
      if (!state.youtubeReady) return;
      const playerState = state.youtubePlayer.getPlayerState();
      if (playerState === YT.PlayerState.PLAYING) {
        state.youtubePlayer.pauseVideo();
      } else {
        state.youtubePlayer.playVideo();
      }
      return;
    }

    if (elements.videoPlayer.paused) {
      elements.videoPlayer.play();
    } else {
      elements.videoPlayer.pause();
    }
  });

  elements.seekControl.addEventListener("input", () => {
    if (state.youtubeMode) {
      if (!state.youtubeReady) return;
      state.youtubePlayer.seekTo(Number(elements.seekControl.value), true);
      emitPlayback("seek");
      return;
    }

    elements.videoPlayer.currentTime = Number(elements.seekControl.value);
    emitPlayback("seek");
  });

  elements.volumeControl.addEventListener("input", () => {
    const volume = Number(elements.volumeControl.value);
    if (state.youtubeMode && state.youtubeReady) {
      state.youtubePlayer.setVolume(Math.round(volume * 100));
      emitPlayback("volume");
      return;
    }

    elements.videoPlayer.volume = volume;
    emitPlayback("volume");
  });

  elements.videoPlayer.addEventListener("play", () => emitPlayback("play"));
  elements.videoPlayer.addEventListener("pause", () => emitPlayback("pause"));
  elements.videoPlayer.addEventListener("timeupdate", updateTimeUi);
  elements.videoPlayer.addEventListener("durationchange", updateTimeUi);

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    state.socket.emit("chat:message", message);
    elements.chatInput.value = "";
  });
}

function loadVideo(url, shouldUpdateInput) {
  if (shouldUpdateInput) {
    elements.videoUrlInput.value = url;
  }

  const youtubeId = getYoutubeVideoId(url);
  state.youtubeMode = Boolean(youtubeId);
  elements.emptyState.hidden = true;

  if (state.youtubeMode) {
    elements.videoPlayer.pause();
    elements.videoPlayer.hidden = true;
    setYoutubeHidden(false);
    elements.playPauseButton.disabled = false;
    elements.seekControl.disabled = false;
    loadYoutubeVideo(youtubeId);
    return;
  }

  setYoutubeHidden(true);
  stopYoutubeTimer();
  if (state.youtubePlayer) {
    state.youtubePlayer.stopVideo();
  }
  elements.videoPlayer.hidden = false;
  elements.playPauseButton.disabled = false;
  elements.seekControl.disabled = false;

  if (elements.videoPlayer.src !== url) {
    elements.videoPlayer.src = url;
    elements.videoPlayer.load();
  }
}

function applyPlayback(playback) {
  if (!playback) return;

  if (state.youtubeMode) {
    applyYoutubePlayback(playback);
    return;
  }

  state.syncing = true;
  elements.videoPlayer.volume = playback.volume;
  elements.volumeControl.value = playback.volume;

  if (Number.isFinite(playback.currentTime)) {
    const drift = Math.abs(elements.videoPlayer.currentTime - playback.currentTime);
    if (drift > 0.75) {
      elements.videoPlayer.currentTime = playback.currentTime;
    }
  }

  if (playback.isPlaying && elements.videoPlayer.paused) {
    elements.videoPlayer.play().catch(() => {});
  }

  if (!playback.isPlaying && !elements.videoPlayer.paused) {
    elements.videoPlayer.pause();
  }

  state.syncing = false;
  updateTimeUi();
}

function emitPlayback(type) {
  if (state.syncing) return;

  state.socket.emit("playback:event", {
    type,
    currentTime: getCurrentTime(),
    volume: getVolume()
  });
}

function updateTimeUi() {
  const duration = getDuration();
  const currentTime = getCurrentTime();

  elements.seekControl.max = Math.max(duration, 100);
  elements.seekControl.value = currentTime;
  elements.timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  elements.playPauseButton.textContent = isPlaying() ? "Pause" : "Play";
}

function renderParticipants(participants) {
  elements.participantCount.textContent = participants.length;
  elements.participants.innerHTML = participants.map((participant) => `
    <article class="participant">
      <div class="avatar">${escapeHtml(participant.avatar)}</div>
      <div>
        <strong>${escapeHtml(participant.name)}${participant.id === state.selfId ? " · Вы" : ""}</strong>
        <span class="status">${escapeHtml(participant.status)}</span>
      </div>
    </article>
  `).join("");
}

function renderMessages(messages) {
  elements.messages.innerHTML = "";
  for (const message of messages) {
    appendMessage(message);
  }
}

function appendMessage(message) {
  const article = document.createElement("article");
  article.className = "message";
  article.innerHTML = `
    <strong>${escapeHtml(message.author)}</strong>
    <time>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    <p>${escapeHtml(message.text)}</p>
  `;
  elements.messages.append(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function loadYoutubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (state.youtubeApiPromise) {
    return state.youtubeApiPromise;
  }

  state.youtubeApiPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });

  return state.youtubeApiPromise;
}

async function loadYoutubeVideo(videoId) {
  state.youtubeReady = false;
  await loadYoutubeApi();

  if (state.youtubePlayer) {
    state.youtubePlayer.loadVideoById(videoId);
    state.youtubePlayer.pauseVideo();
    state.youtubeReady = true;
    startYoutubeTimer();
    return;
  }

  state.youtubePlayer = new YT.Player("youtubeHost", {
    videoId,
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        state.youtubeReady = true;
        state.youtubePlayer.setVolume(Math.round(Number(elements.volumeControl.value) * 100));
        startYoutubeTimer();
      },
      onStateChange: (event) => {
        if (state.syncing) return;
        if (event.data === YT.PlayerState.PLAYING) emitPlayback("play");
        if (event.data === YT.PlayerState.PAUSED) emitPlayback("pause");
        updateTimeUi();
      }
    }
  });
}

function applyYoutubePlayback(playback) {
  if (!state.youtubeReady || !state.youtubePlayer) return;

  state.syncing = true;
  state.youtubePlayer.setVolume(Math.round(playback.volume * 100));
  elements.volumeControl.value = playback.volume;

  const currentTime = state.youtubePlayer.getCurrentTime() || 0;
  if (Math.abs(currentTime - playback.currentTime) > 0.75) {
    state.youtubePlayer.seekTo(playback.currentTime, true);
  }

  if (playback.isPlaying) {
    state.youtubePlayer.playVideo();
  } else {
    state.youtubePlayer.pauseVideo();
  }

  state.syncing = false;
  updateTimeUi();
}

function startYoutubeTimer() {
  stopYoutubeTimer();
  state.youtubeTimeTimer = setInterval(updateTimeUi, 500);
}

function stopYoutubeTimer() {
  if (state.youtubeTimeTimer) {
    clearInterval(state.youtubeTimeTimer);
    state.youtubeTimeTimer = null;
  }
}

function getCurrentTime() {
  if (state.youtubeMode && state.youtubeReady) {
    return state.youtubePlayer.getCurrentTime() || 0;
  }

  return elements.videoPlayer.currentTime || 0;
}

function getDuration() {
  if (state.youtubeMode && state.youtubeReady) {
    return state.youtubePlayer.getDuration() || 0;
  }

  return Number.isFinite(elements.videoPlayer.duration) ? elements.videoPlayer.duration : 0;
}

function getVolume() {
  if (state.youtubeMode && state.youtubeReady) {
    return (state.youtubePlayer.getVolume() || 0) / 100;
  }

  return elements.videoPlayer.volume;
}

function isPlaying() {
  if (state.youtubeMode && state.youtubeReady) {
    return state.youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
  }

  return !elements.videoPlayer.paused;
}

function getYoutubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.slice(1);
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      videoId = parsed.searchParams.get("v") || "";
    }

    if (!videoId) return "";
    return videoId;
  } catch {
    return "";
  }
}

function setYoutubeHidden(hidden) {
  const youtubeElement = document.querySelector("#youtubeHost");
  if (youtubeElement) {
    youtubeElement.hidden = hidden;
  }
}

function createGuestName() {
  return `Guest ${Math.floor(100 + Math.random() * 900)}`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
