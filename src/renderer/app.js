const ui = {
  roomLabel: document.querySelector("#roomLabel"),
  inviteUrl: document.querySelector("#inviteUrl"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  tabTitle: document.querySelector("#tabTitle"),
  addressForm: document.querySelector("#addressForm"),
  addressInput: document.querySelector("#addressInput"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  stream: document.querySelector("#browserStream"),
  homeScreen: document.querySelector("#homeScreen"),
  pageOverlay: document.querySelector("#pageOverlay"),
  homeForm: document.querySelector("#homeForm"),
  homeInput: document.querySelector("#homeInput"),
  newTabButton: document.querySelector("#newTabButton"),
  statusText: document.querySelector("#statusText"),
  adblockText: document.querySelector("#adblockText"),
  participants: document.querySelector("#participants"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

const state = {
  roomCode: "",
  inviteUrl: "",
  currentUrl: "",
  socket: null
};

init();

async function init() {
  const info = await window.miniBeam.getServerInfo();
  const params = new URLSearchParams(location.search);
  state.roomCode = params.get("room") || "";
  state.inviteUrl = info.lanUrl;

  ui.roomLabel.textContent = state.roomCode ? `Комната ${state.roomCode}` : "Подключение";
  ui.inviteUrl.textContent = info.lanUrl;

  state.socket = io({ auth: { room: state.roomCode || undefined } });
  bindSocket();
  bindUi();
}

function bindSocket() {
  state.socket.on("room:state", (room) => {
    state.roomCode = room.roomCode;
    state.inviteUrl = `${location.origin}/?room=${room.roomCode}`;
    ui.roomLabel.textContent = `Комната ${room.roomCode}`;
    ui.inviteUrl.textContent = state.inviteUrl;
    if (room.browserUrl) setUrl(room.browserUrl);
    if (room.title) setTitle(room.title);
    if (Number.isFinite(room.blockedCount)) ui.adblockText.textContent = `Блок: ${room.blockedCount}`;
    renderParticipants(room.participants || []);
    renderMessages(room.messages || []);
  });

  state.socket.on("browser:frame", (frame) => {
    ui.stream.src = `data:image/jpeg;base64,${frame}`;
    ui.homeScreen.hidden = true;
  });

  state.socket.on("browser:state", (browser) => {
    if (browser.url) setUrl(browser.url);
    if (browser.title) setTitle(browser.title);
    ui.statusText.textContent = browser.loading ? "Загрузка..." : "Готово";
    ui.backButton.disabled = !browser.canGoBack;
    ui.forwardButton.disabled = !browser.canGoForward;
    if (Number.isFinite(browser.blockedCount)) ui.adblockText.textContent = `Блок: ${browser.blockedCount}`;
    if (browser.error) showOverlay(`Страница не открылась: ${browser.error}`);
  });

  state.socket.on("chat:message", appendMessage);
}

function bindUi() {
  ui.copyInviteButton.addEventListener("click", async () => {
    await window.miniBeam.copy(`${state.roomCode} ${state.inviteUrl}`);
    flash(ui.copyInviteButton, "Скопировано", "Копировать приглашение");
  });

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
  ui.reloadButton.addEventListener("click", () => state.socket.emit("browser:reload"));
  ui.newTabButton.addEventListener("click", showHome);

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
    if (isTypingInUi()) return;
    state.socket.emit("browser:input", { type: "key", eventType: "keyDown", key: event.key });
  });
  window.addEventListener("keyup", (event) => {
    if (isTypingInUi()) return;
    state.socket.emit("browser:input", { type: "key", eventType: "keyUp", key: event.key });
  });

  ui.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text) return;
    state.socket.emit("chat:message", text);
    ui.chatInput.value = "";
  });
}

function navigate(value) {
  const url = normalizeUrl(value);
  if (!url) return;
  setUrl(url);
  ui.pageOverlay.hidden = true;
  ui.homeScreen.hidden = true;
  state.socket.emit("browser:navigate", url);
}

function showHome() {
  ui.homeScreen.hidden = false;
  ui.pageOverlay.hidden = true;
  ui.stream.removeAttribute("src");
  setTitle("New tab");
}

function sendMouse(event, eventType) {
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
