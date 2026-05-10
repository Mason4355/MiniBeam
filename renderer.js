const serverUrl = window.miniBeam?.serverUrl || "http://127.0.0.1:3847";

const ui = {
  tabs: document.querySelector("#tabs"),
  newTabButton: document.querySelector("#newTabButton"),
  addressForm: document.querySelector("#addressForm"),
  addressInput: document.querySelector("#addressInput"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  browserView: document.querySelector("#browserView"),
  statusText: document.querySelector("#statusText"),
  roomLabel: document.querySelector("#roomLabel"),
  onlineLabel: document.querySelector("#onlineLabel"),
  participants: document.querySelector("#participants"),
  inviteUrl: document.querySelector("#inviteUrl"),
  copyInviteButton: document.querySelector("#copyInviteButton"),
  copyInviteButtonPanel: document.querySelector("#copyInviteButtonPanel"),
  copyInviteButtonFooter: document.querySelector("#copyInviteButtonFooter"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

const state = {
  socket: null,
  selfId: "",
  roomCode: "",
  inviteUrl: serverUrl,
  activeTabId: "",
  tabs: [],
  applyingRemote: false
};

loadSocketClient().then(boot).catch(() => {
  ui.statusText.textContent = "Сервер не найден";
});

function loadSocketClient() {
  if (window.io) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${serverUrl}/socket.io/socket.io.js`;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function boot() {
  state.socket = io(serverUrl, { transports: ["websocket", "polling"] });
  bindSocket();
  bindUi();
  bindWebview();
}

function bindSocket() {
  state.socket.on("connect", () => {
    state.selfId = state.socket.id;
    state.socket.emit("room:join", { name: getSavedName() });
    ui.statusText.textContent = "Подключено";
  });

  state.socket.on("disconnect", () => {
    ui.statusText.textContent = "Нет соединения";
  });

  state.socket.on("room:state", (room) => {
    state.roomCode = room.roomCode;
    state.selfId = room.selfId || state.selfId;
    state.inviteUrl = serverUrl;
    applyBrowserState(room);
    renderParticipants(room.participants || []);
    renderMessages(room.messages || []);
    ui.roomLabel.textContent = `Комната ${room.roomCode}`;
    ui.inviteUrl.textContent = state.inviteUrl;
  });

  state.socket.on("room:participants", renderParticipants);
  state.socket.on("browser:state", applyBrowserState);
  state.socket.on("browser:reload", (payload) => {
    if (payload.sourceId === state.selfId) return;
    ui.browserView.reload();
  });
  state.socket.on("browser:click", () => {
    ui.statusText.textContent = "Активность в браузере";
  });
  state.socket.on("browser:input", () => {
    ui.statusText.textContent = "Ввод в браузере";
  });
  state.socket.on("chat:message", appendMessage);
}

function bindUi() {
  ui.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = normalizeUrl(ui.addressInput.value);
    if (!url) return;
    navigateLocal(url);
    state.socket.emit("browser:navigate", { url });
  });

  ui.backButton.addEventListener("click", () => {
    if (ui.browserView.canGoBack()) ui.browserView.goBack();
    state.socket.emit("browser:back");
  });

  ui.forwardButton.addEventListener("click", () => {
    if (ui.browserView.canGoForward()) ui.browserView.goForward();
    state.socket.emit("browser:forward");
  });

  ui.reloadButton.addEventListener("click", () => {
    ui.browserView.reload();
    state.socket.emit("browser:reload");
  });

  ui.newTabButton.addEventListener("click", () => {
    state.socket.emit("browser:tab:new");
  });

  ui.copyInviteButton.addEventListener("click", () => copyInvite(ui.copyInviteButton, "＋"));
  ui.copyInviteButtonPanel.addEventListener("click", () => copyInvite(ui.copyInviteButtonPanel, "Копировать ссылку"));
  ui.copyInviteButtonFooter.addEventListener("click", () => copyInvite(ui.copyInviteButtonFooter, "Копировать приглашение"));

  ui.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    if (!text) return;
    state.socket.emit("chat:message", text);
    ui.chatInput.value = "";
  });

  ui.browserView.addEventListener("mousedown", () => state.socket.emit("browser:click", { tabId: state.activeTabId }));
  window.addEventListener("keydown", (event) => {
    if (isTypingInUi()) return;
    state.socket.emit("browser:input", { tabId: state.activeTabId, key: event.key });
  });
}

function bindWebview() {
  ui.browserView.addEventListener("did-start-loading", () => {
    ui.statusText.textContent = "Загрузка...";
  });

  ui.browserView.addEventListener("did-stop-loading", () => {
    ui.statusText.textContent = "Готово";
    updateNavigationButtons();
  });

  ui.browserView.addEventListener("did-navigate", reportWebviewUrl);
  ui.browserView.addEventListener("did-navigate-in-page", reportWebviewUrl);
  ui.browserView.addEventListener("page-title-updated", (event) => {
    updateActiveTabTitle(event.title);
    state.socket.emit("browser:updateURL", {
      tabId: state.activeTabId,
      url: ui.browserView.getURL(),
      title: event.title
    });
  });
  ui.browserView.addEventListener("new-window", (event) => {
    const url = event.url;
    state.socket.emit("browser:tab:new");
    setTimeout(() => {
      navigateLocal(url);
      state.socket.emit("browser:navigate", { url });
    }, 150);
  });
}

function applyBrowserState(nextState) {
  state.activeTabId = nextState.activeTabId || state.activeTabId;
  state.tabs = nextState.tabs || state.tabs;
  renderTabs();
  updateNavigationButtons();

  if (nextState.url && nextState.sourceId !== state.selfId && ui.browserView.getURL() !== nextState.url) {
    navigateLocal(nextState.url, true);
  }

  if (nextState.url) ui.addressInput.value = nextState.url;
}

function navigateLocal(url, remote = false) {
  state.applyingRemote = remote;
  ui.addressInput.value = url;
  ui.browserView.src = url;
  setTimeout(() => {
    state.applyingRemote = false;
  }, 400);
}

function reportWebviewUrl(event) {
  const url = event.url || ui.browserView.getURL();
  ui.addressInput.value = url;
  updateActiveTabUrl(url);
  updateNavigationButtons();
  if (state.applyingRemote) return;
  state.socket.emit("browser:updateURL", {
    tabId: state.activeTabId,
    url,
    title: ui.browserView.getTitle?.() || getTitleFromUrl(url)
  });
}

function renderTabs() {
  ui.tabs.innerHTML = "";
  state.tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.className = `tab ${tab.active ? "active" : ""}`;
    button.type = "button";
    button.title = tab.url || tab.title || "New tab";
    button.innerHTML = `<span class="tab-dot"></span>${escapeHtml(tab.title || "New tab")}`;
    button.addEventListener("click", () => {
      state.socket.emit("browser:tab:switch", { tabId: tab.id });
    });
    ui.tabs.append(button);
  });
}

function renderParticipants(participants) {
  ui.onlineLabel.textContent = `${participants.length} онлайн`;
  ui.participants.innerHTML = "";
  participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant";
    item.innerHTML = `
      <span class="avatar">${escapeHtml(getInitials(participant.name))}</span>
      <div>
        <strong>${escapeHtml(participant.name)}</strong>
        <small>${participant.role === "host" ? "host" : "online"}</small>
      </div>
    `;
    ui.participants.append(item);
  });
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

function updateNavigationButtons() {
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  ui.backButton.disabled = activeTab ? !activeTab.canGoBack : !ui.browserView.canGoBack();
  ui.forwardButton.disabled = activeTab ? !activeTab.canGoForward : !ui.browserView.canGoForward();
}

function updateActiveTabUrl(url) {
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  if (tab) tab.url = url;
}

function updateActiveTabTitle(title) {
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  if (tab) tab.title = title || "New tab";
  renderTabs();
}

async function copyInvite(button, originalText) {
  window.miniBeam.copy(`${state.roomCode} ${state.inviteUrl}`);
  flash(button, "Скопировано", originalText);
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
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "New tab";
  }
}

function getSavedName() {
  const existing = localStorage.getItem("minibeam:name");
  if (existing) return existing;
  const name = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem("minibeam:name", name);
  return name;
}

function getInitials(name) {
  return String(name || "G")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isTypingInUi() {
  return [ui.addressInput, ui.chatInput].includes(document.activeElement);
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
