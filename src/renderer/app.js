const ui = {
  roomLabel: document.querySelector("#roomLabel"),
  inviteUrl: document.querySelector("#inviteUrl"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  participants: document.querySelector("#participants"),
  tabTitle: document.querySelector("#tabTitle"),
  newTabButton: document.querySelector("#newTabButton"),
  addressForm: document.querySelector("#addressForm"),
  addressInput: document.querySelector("#addressInput"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  homeScreen: document.querySelector("#homeScreen"),
  pageOverlay: document.querySelector("#pageOverlay"),
  homeForm: document.querySelector("#homeForm"),
  homeInput: document.querySelector("#homeInput"),
  statusText: document.querySelector("#statusText"),
  adblockText: document.querySelector("#adblockText"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

const state = {
  roomCode: "",
  inviteUrl: "",
  currentUrl: "",
  selfId: "",
  socket: null,
  zoom: 1,
  syncing: false,
  lastBroadcastUrl: ""
};

init();

async function init() {
  const info = await window.miniBeam.getServerInfo();
  const params = new URLSearchParams(location.search);
  state.roomCode = params.get("room") || info.roomCode;
  state.inviteUrl = info.lanUrl;

  ui.roomLabel.textContent = state.roomCode ? `Комната ${state.roomCode}` : "Подключение";
  ui.inviteUrl.textContent = info.lanUrl;

  state.socket = io({
    auth: {
      room: state.roomCode || undefined,
      name: localStorage.getItem("minibeam:name") || createName(),
      host: location.hostname === "127.0.0.1" || location.hostname === "localhost"
    }
  });

  bindSocket();
  bindUi();
  bindBrowser();
}

function bindSocket() {
  state.socket.on("room:state", (room) => {
    state.selfId = room.selfId;
    state.roomCode = room.roomCode;
    state.inviteUrl = `${location.origin}/?room=${room.roomCode}`;
    ui.roomLabel.textContent = `Комната ${room.roomCode}`;
    ui.inviteUrl.textContent = state.inviteUrl;
    renderParticipants(room.participants);
    renderMessages(room.messages);
    if (room.browserUrl) navigate(room.browserUrl, false);
  });

  state.socket.on("room:error", (message) => setStatus(message));
  state.socket.on("participants:update", renderParticipants);
  state.socket.on("browser:navigate", (url) => navigate(url, false));
  state.socket.on("chat:message", appendMessage);
}

function bindUi() {
  ui.copyInviteButton.addEventListener("click", async () => {
    await window.miniBeam.copy(`${state.roomCode} ${state.inviteUrl}`);
    flash(ui.copyInviteButton, "Скопировано", "Копировать приглашение");
  });

  ui.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(ui.addressInput.value, true);
  });

  ui.homeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(ui.homeInput.value, true);
  });

  document.querySelectorAll("[data-url]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.url, true));
  });

  ui.backButton.addEventListener("click", () => window.miniBeam.back());
  ui.forwardButton.addEventListener("click", () => window.miniBeam.forward());
  ui.reloadButton.addEventListener("click", () => window.miniBeam.reload());
  ui.newTabButton.addEventListener("click", showHome);

  ui.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text) return;
    state.socket.emit("chat:message", text);
    ui.chatInput.value = "";
  });
}

function bindBrowser() {
  window.miniBeam.onBrowserEvent((event) => {
    if (event.type === "loading") {
      setStatus(event.loading ? "Загрузка..." : "Готово");
      return;
    }

    if (event.type === "navigation-state") {
      ui.backButton.disabled = !event.canGoBack;
      ui.forwardButton.disabled = !event.canGoForward;
      ui.reloadButton.disabled = !state.currentUrl;
      return;
    }

    if (event.type === "title") {
      const title = event.title || "New tab";
      ui.tabTitle.textContent = title;
      ui.tabTitle.title = title;
      return;
    }

    if (event.type === "navigated") {
      onNavigated(event.url);
      return;
    }

    if (event.type === "new-window") {
      navigate(event.url, true);
      return;
    }

    if (event.type === "load-error") {
      setOverlay(`Страница не открылась: ${event.errorDescription || "ошибка загрузки"}`);
      setStatus("Ошибка загрузки");
      return;
    }

    if (event.type === "adblock") {
      ui.adblockText.textContent = `Блок: ${event.count}`;
      ui.adblockText.title = event.url || "";
    }
  });
}

async function navigate(value, broadcast) {
  const url = normalizeUrl(value);
  if (!url) return;

  state.currentUrl = url;
  ui.addressInput.value = url;
  ui.homeScreen.hidden = true;
  ui.pageOverlay.hidden = true;
  state.syncing = !broadcast;
  await window.miniBeam.navigate(url);

  if (broadcast) {
    state.lastBroadcastUrl = url;
    state.socket.emit("browser:navigate", url);
  }
}

function onNavigated(url) {
  if (!url || url === "about:blank") return;
  state.currentUrl = url;
  ui.addressInput.value = url;
  ui.reloadButton.disabled = false;

  if (state.syncing) {
    state.syncing = false;
    return;
  }

  if (url === state.lastBroadcastUrl) return;
  state.lastBroadcastUrl = url;
  state.socket.emit("browser:navigate", url);
}

function showHome() {
  state.currentUrl = "";
  ui.addressInput.value = "";
  ui.homeInput.value = "";
  ui.homeScreen.hidden = false;
  ui.pageOverlay.hidden = true;
  ui.tabTitle.textContent = "New tab";
  ui.tabTitle.title = "New tab";
  ui.reloadButton.disabled = true;
  setStatus("Готово");
  window.miniBeam.home();
}

function setOverlay(message) {
  ui.pageOverlay.textContent = message;
  ui.pageOverlay.hidden = false;
}

function setStatus(text) {
  ui.statusText.textContent = text;
}

function renderParticipants(participants) {
  ui.participants.innerHTML = participants.map((participant) => `
    <article class="participant" title="${escapeHtml(participant.name)}: ${escapeHtml(participant.status)}">
      <span>${escapeHtml(participant.avatar)}</span>
    </article>
  `).join("");
}

function renderMessages(messages) {
  ui.messages.innerHTML = "";
  messages.forEach(appendMessage);
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

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(".") && !text.includes(" ")) return `https://${text}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

function createName() {
  const name = `Guest ${Math.floor(100 + Math.random() * 900)}`;
  localStorage.setItem("minibeam:name", name);
  return name;
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
