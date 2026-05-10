const ui = {
  roomLabel: document.querySelector("#roomLabel"),
  inviteUrl: document.querySelector("#inviteUrl"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  copyInviteButtonPanel: document.querySelector("#copyInviteButtonPanel"),
  tabTitle: document.querySelector("#tabTitle"),
  addressForm: document.querySelector("#addressForm"),
  addressInput: document.querySelector("#addressInput"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  stream: document.querySelector("#browserStream"),
  playerLayer: document.querySelector("#playerLayer"),
  youtubeFrame: document.querySelector("#youtubeFrame"),
  htmlVideo: document.querySelector("#htmlVideo"),
  iframeNotice: document.querySelector("#iframeNotice"),
  homeScreen: document.querySelector("#homeScreen"),
  pageOverlay: document.querySelector("#pageOverlay"),
  homeForm: document.querySelector("#homeForm"),
  homeInput: document.querySelector("#homeInput"),
  startBrowserButton: document.querySelector("#startBrowserButton"),
  newTabButton: document.querySelector("#newTabButton"),
  statusText: document.querySelector("#statusText"),
  adblockText: document.querySelector("#adblockText"),
  participants: document.querySelector("#participants"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  playPauseButton: document.querySelector("#playPauseButton"),
  seekRange: document.querySelector("#seekRange"),
  volumeRange: document.querySelector("#volumeRange")
};

const state = {
  roomCode: "",
  inviteUrl: "",
  currentUrl: "",
  socket: null,
  player: {
    mode: "browser",
    url: "",
    provider: "browser",
    playing: false,
    currentTime: 0,
    volume: 0.7,
    updatedAt: Date.now()
  },
  applyingRemote: false,
  seekDragging: false
};

init();

async function init() {
  const info = await window.miniBeam.getServerInfo();
  const params = new URLSearchParams(location.search);
  state.roomCode = params.get("room") || "";
  state.inviteUrl = info.lanUrl;

  ui.roomLabel.textContent = state.roomCode ? `Комната ${state.roomCode}` : "Подключение";
  ui.inviteUrl.textContent = info.lanUrl;
  ui.volumeRange.value = "70";

  state.socket = io({ auth: { room: state.roomCode || undefined } });
  bindSocket();
  bindUi();
  setInterval(updateLocalClock, 500);
}

function bindSocket() {
  state.socket.on("room:state", (room) => {
    state.roomCode = room.roomCode;
    state.inviteUrl = `${location.origin}/?room=${room.roomCode}`;
    ui.roomLabel.textContent = `Дом ${room.roomCode}`;
    ui.inviteUrl.textContent = state.inviteUrl;
    if (room.browserUrl) setUrl(room.browserUrl);
    if (room.title) setTitle(room.title);
    if (Number.isFinite(room.blockedCount)) setBlockedCount(room.blockedCount);
    renderParticipants(room.participants || []);
    renderMessages(room.messages || []);
    if (room.player) applyPlayerState(room.player);
  });

  state.socket.on("browser:frame", (frame) => {
    if (state.player.mode === "player") return;
    ui.stream.src = `data:image/jpeg;base64,${frame}`;
    showBrowserMode();
  });

  state.socket.on("browser:state", (browser) => {
    if (browser.url) setUrl(browser.url);
    if (browser.title) setTitle(browser.title);
    ui.statusText.textContent = browser.loading ? "Загрузка..." : "Готово";
    ui.backButton.disabled = !browser.canGoBack;
    ui.forwardButton.disabled = !browser.canGoForward;
    if (Number.isFinite(browser.blockedCount)) setBlockedCount(browser.blockedCount);
    if (browser.error) showOverlay(`Страница не открылась: ${browser.error}`);
  });

  state.socket.on("player:state", applyPlayerState);
  state.socket.on("chat:message", appendMessage);
}

function bindUi() {
  ui.copyInviteButton.addEventListener("click", () => copyInvite(ui.copyInviteButton, "+"));
  ui.copyInviteButtonPanel.addEventListener("click", () => copyInvite(ui.copyInviteButtonPanel, "Пригласить друзей"));

  ui.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(ui.addressInput.value);
  });

  ui.homeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(ui.homeInput.value);
  });

  document.querySelectorAll("[data-url]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.url));
  });

  ui.backButton.addEventListener("click", () => state.socket.emit("browser:back"));
  ui.forwardButton.addEventListener("click", () => state.socket.emit("browser:forward"));
  ui.reloadButton.addEventListener("click", () => {
    if (state.player.mode === "player") {
      state.socket.emit("player:load", { url: state.player.url, provider: state.player.provider, volume: state.player.volume });
    } else {
      state.socket.emit("browser:reload");
    }
  });
  ui.newTabButton.addEventListener("click", showHome);
  ui.startBrowserButton.addEventListener("click", () => navigate("https://duckduckgo.com"));

  ui.playPauseButton.addEventListener("click", () => {
    if (state.player.mode !== "player") return;
    const eventName = state.player.playing ? "player:pause" : "player:play";
    state.socket.emit(eventName, { currentTime: getCurrentPlayerTime() });
  });

  ui.seekRange.addEventListener("input", () => {
    state.seekDragging = true;
  });
  ui.seekRange.addEventListener("change", () => {
    state.seekDragging = false;
    state.socket.emit("player:seek", { currentTime: Number(ui.seekRange.value) });
  });
  ui.volumeRange.addEventListener("input", () => {
    const volume = Number(ui.volumeRange.value) / 100;
    setLocalVolume(volume);
    state.socket.emit("player:volume", { volume });
  });

  bindBrowserInput();
  bindHtmlVideo();
  bindChat();
}

function bindBrowserInput() {
  ui.stream.addEventListener("mousedown", (event) => sendMouse(event, "mouseDown"));
  ui.stream.addEventListener("mouseup", (event) => sendMouse(event, "mouseUp"));
  ui.stream.addEventListener("mousemove", (event) => {
    if (event.buttons) sendMouse(event, "mouseMove");
  });
  ui.stream.addEventListener("wheel", (event) => {
    event.preventDefault();
    const point = mapPoint(event);
    state.socket.emit("browser:input", {
      type: "wheel",
      x: point.x,
      y: point.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY
    });
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (isTypingInUi() || state.player.mode === "player") return;
    state.socket.emit("browser:input", { type: "key", eventType: "keyDown", key: event.key });
  });
  window.addEventListener("keyup", (event) => {
    if (isTypingInUi() || state.player.mode === "player") return;
    state.socket.emit("browser:input", { type: "key", eventType: "keyUp", key: event.key });
  });
}

function bindHtmlVideo() {
  ui.htmlVideo.addEventListener("play", () => {
    if (state.applyingRemote) return;
    state.socket.emit("player:play", { currentTime: ui.htmlVideo.currentTime });
  });
  ui.htmlVideo.addEventListener("pause", () => {
    if (state.applyingRemote) return;
    state.socket.emit("player:pause", { currentTime: ui.htmlVideo.currentTime });
  });
  ui.htmlVideo.addEventListener("seeked", () => {
    if (state.applyingRemote) return;
    state.socket.emit("player:seek", { currentTime: ui.htmlVideo.currentTime });
  });
  ui.htmlVideo.addEventListener("volumechange", () => {
    if (state.applyingRemote) return;
    state.socket.emit("player:volume", { volume: ui.htmlVideo.volume });
  });
  ui.htmlVideo.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(ui.htmlVideo.duration)) ui.seekRange.max = String(Math.floor(ui.htmlVideo.duration));
  });
}

function bindChat() {
  ui.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text) return;
    state.socket.emit("chat:message", text);
    ui.chatInput.value = "";
  });
}

async function copyInvite(button, originalText) {
  await window.miniBeam.copy(`${state.roomCode} ${state.inviteUrl}`);
  flash(button, "Скопировано", originalText);
}

function navigate(value) {
  const url = normalizeUrl(value);
  if (!url) return;
  setUrl(url);
  ui.pageOverlay.hidden = true;
  ui.homeScreen.hidden = true;

  const provider = detectProvider(url);
  if (provider === "browser") {
    state.socket.emit("browser:navigate", url);
    return;
  }

  state.socket.emit("player:load", {
    url,
    provider,
    volume: Number(ui.volumeRange.value) / 100
  });
}

function applyPlayerState(nextPlayer) {
  if (!nextPlayer) return;
  state.player = {
    ...state.player,
    ...nextPlayer,
    updatedAt: Date.now()
  };

  ui.playPauseButton.textContent = state.player.playing ? "⏸" : "▶";
  ui.volumeRange.value = String(Math.round((state.player.volume || 0) * 100));

  if (state.player.mode !== "player") {
    showBrowserMode();
    return;
  }

  showPlayerMode();
  setUrl(state.player.url);
  setTitle(state.player.provider === "youtube" ? "YouTube" : "Video");
  ui.seekRange.max = state.player.provider === "html5" && Number.isFinite(ui.htmlVideo.duration)
    ? String(Math.floor(ui.htmlVideo.duration))
    : "7200";

  state.applyingRemote = true;
  if (state.player.provider === "youtube") {
    loadYoutube(state.player.url);
    postYoutube(state.player.playing ? "playVideo" : "pauseVideo");
    postYoutube("seekTo", [Math.max(0, state.player.currentTime), true]);
    postYoutube("setVolume", [Math.round(state.player.volume * 100)]);
  } else if (state.player.provider === "html5") {
    loadHtmlVideo(state.player.url);
    syncHtmlVideo();
  } else {
    showIframeNotice();
  }
  setTimeout(() => {
    state.applyingRemote = false;
  }, 250);
}

function showBrowserMode() {
  state.player.mode = "browser";
  ui.playerLayer.hidden = true;
  ui.homeScreen.hidden = Boolean(ui.stream.src);
}

function showPlayerMode() {
  ui.playerLayer.hidden = false;
  ui.homeScreen.hidden = true;
  ui.stream.removeAttribute("src");
  ui.youtubeFrame.hidden = state.player.provider !== "youtube";
  ui.htmlVideo.hidden = state.player.provider !== "html5";
  ui.iframeNotice.hidden = state.player.provider === "youtube" || state.player.provider === "html5";
}

function loadYoutube(url) {
  const videoId = getYoutubeId(url);
  if (!videoId) return showIframeNotice();
  const src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
  if (ui.youtubeFrame.src !== src) ui.youtubeFrame.src = src;
}

function loadHtmlVideo(url) {
  if (ui.htmlVideo.src !== url) {
    ui.htmlVideo.src = url;
    ui.htmlVideo.load();
  }
}

async function syncHtmlVideo() {
  const target = Math.max(0, state.player.currentTime);
  if (Math.abs(ui.htmlVideo.currentTime - target) > 0.75) ui.htmlVideo.currentTime = target;
  setLocalVolume(state.player.volume);
  if (state.player.playing) {
    try {
      await ui.htmlVideo.play();
    } catch {
      ui.statusText.textContent = "Нажмите Play";
    }
  } else {
    ui.htmlVideo.pause();
  }
}

function showIframeNotice() {
  ui.youtubeFrame.hidden = true;
  ui.htmlVideo.hidden = true;
  ui.iframeNotice.hidden = false;
}

function postYoutube(command, args = []) {
  if (!ui.youtubeFrame.contentWindow) return;
  ui.youtubeFrame.contentWindow.postMessage(JSON.stringify({
    event: "command",
    func: command,
    args
  }), "*");
}

function setLocalVolume(volume) {
  const nextVolume = Math.min(1, Math.max(0, Number(volume) || 0));
  ui.htmlVideo.volume = nextVolume;
  postYoutube("setVolume", [Math.round(nextVolume * 100)]);
}

function updateLocalClock() {
  if (state.player.mode !== "player") return;
  const time = getCurrentPlayerTime();
  if (!state.seekDragging) ui.seekRange.value = String(Math.floor(time));
  ui.statusText.textContent = state.player.playing ? `Смотрим ${formatTime(time)}` : `Пауза ${formatTime(time)}`;
}

function getCurrentPlayerTime() {
  if (state.player.provider === "html5" && Number.isFinite(ui.htmlVideo.currentTime)) return ui.htmlVideo.currentTime;
  if (!state.player.playing) return Number(state.player.currentTime) || 0;
  return (Number(state.player.currentTime) || 0) + (Date.now() - state.player.updatedAt) / 1000;
}

function showHome() {
  state.player.mode = "browser";
  ui.playerLayer.hidden = true;
  ui.homeScreen.hidden = false;
  ui.pageOverlay.hidden = true;
  ui.stream.removeAttribute("src");
  setTitle("New tab");
}

function sendMouse(event, eventType) {
  if (state.player.mode === "player") return;
  const point = mapPoint(event);
  state.socket.emit("browser:input", {
    type: "mouse",
    eventType,
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
}

function mapPoint(event) {
  const rect = ui.stream.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1279, ((event.clientX - rect.left) / rect.width) * 1280)),
    y: Math.max(0, Math.min(719, ((event.clientY - rect.top) / rect.height) * 720))
  };
}

function isTypingInUi() {
  return [ui.addressInput, ui.homeInput, ui.chatInput].includes(document.activeElement);
}

function setUrl(url) {
  state.currentUrl = url;
  ui.addressInput.value = url;
}

function setTitle(title) {
  ui.tabTitle.textContent = title;
  ui.tabTitle.title = title;
}

function setBlockedCount(count) {
  ui.adblockText.textContent = count ? String(count) : "M";
}

function showOverlay(message) {
  ui.pageOverlay.textContent = message;
  ui.pageOverlay.hidden = false;
}

function appendMessage(message) {
  const item = document.createElement("article");
  item.className = "message";
  item.innerHTML = `
    <strong>${escapeHtml(message.author)}</strong>
    <time>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    <p>${escapeHtml(message.text)}</p>
  `;
  ui.messages.append(item);
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

function renderParticipants(participants) {
  ui.participants.innerHTML = "";
  participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant";
    item.title = `${participant.name} - ${participant.status}`;
    const avatar = document.createElement("span");
    avatar.textContent = getInitials(participant.name);
    item.append(avatar);
    ui.participants.append(item);
  });
}

function renderMessages(messages) {
  ui.messages.innerHTML = "";
  messages.forEach(appendMessage);
}

function getInitials(name) {
  return String(name || "G")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(".") && !text.includes(" ")) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

function detectProvider(url) {
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(url)) return "html5";
  return "browser";
}

function getYoutubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const match = parsed.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
    return match ? match[2] : "";
  } catch {
    return "";
  }
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function flash(button, text, original) {
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
