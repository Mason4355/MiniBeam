const serverUrl = window.miniBeam?.serverUrl || "http://127.0.0.1:3847";

const ui = {
  tabs: document.querySelector("#tabs"),
  newTabButton: document.querySelector("#newTabButton"),
  addressForm: document.querySelector("#addressForm"),
  addressInput: document.querySelector("#addressInput"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
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
  activeTabId: "",
  tabs: [],
  participants: [],
  messages: [],
  applyingRemote: false
};

loadSocketClient().then(start).catch(() => {
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

function start() {
  state.socket = io(serverUrl, { transports: ["websocket", "polling"] });
  bindSocket();
  bindUi();
  bindBrowserEvents();
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
    state.selfId = room.selfId || state.selfId;
    state.roomCode = room.roomCode;
    state.tabs = room.tabs || [];
    state.activeTabId = room.activeTabId || "";
    state.participants = room.participants || [];
    state.messages = room.messages || [];
    syncAll();
  });

  state.socket.on("participants:update", (participants) => {
    state.participants = participants || [];
    renderParticipants();
  });

  state.socket.on("tab:create", (payload) => {
    upsertTab(payload.tab);
    state.activeTabId = payload.activeTabId || payload.tab?.id || state.activeTabId;
    syncTabs(true);
  });

  state.socket.on("tab:close", (payload) => {
    state.tabs = payload.tabs || state.tabs.filter((tab) => tab.id !== payload.tabId);
    state.activeTabId = payload.activeTabId || state.tabs[0]?.id || "";
    syncTabs(true);
  });

  state.socket.on("tab:switch", (payload) => {
    state.tabs = payload.tabs || state.tabs;
    state.activeTabId = payload.activeTabId || payload.tabId || state.activeTabId;
    syncTabs(true);
  });

  state.socket.on("tab:updateURL", (payload) => {
    if (payload.tabs) state.tabs = payload.tabs;
    else upsertTab(payload.tab);
    state.activeTabId = payload.activeTabId || state.activeTabId;
    syncTabs(payload.sourceId !== state.selfId);
  });

  state.socket.on("chat:message", (message) => {
    state.messages.push(message);
    renderMessages();
  });
}

function bindUi() {
  ui.addressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = normalizeUrl(ui.addressInput.value);
    if (!url || !state.activeTabId) return;
    state.applyingRemote = false;
    window.miniBeam.browser.navigate(state.activeTabId, url);
    state.socket.emit("tab:updateURL", { tabId: state.activeTabId, url, title: getTitleFromUrl(url) });
  });

  ui.backButton.addEventListener("click", () => window.miniBeam.browser.back());
  ui.forwardButton.addEventListener("click", () => window.miniBeam.browser.forward());
  ui.reloadButton.addEventListener("click", () => window.miniBeam.browser.reload());
  ui.newTabButton.addEventListener("click", () => state.socket.emit("tab:create"));

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
}

function bindBrowserEvents() {
  window.miniBeam.browser.onEvent((event) => {
    if (event.type === "loading" && event.tabId === state.activeTabId) {
      ui.statusText.textContent = event.loading ? "Загрузка..." : "Готово";
    }

    if (event.type === "navigation-state" && event.tabId === state.activeTabId) {
      ui.backButton.disabled = !event.canGoBack;
      ui.forwardButton.disabled = !event.canGoForward;
    }

    if (event.type === "navigated") {
      updateLocalTab(event.tabId, { url: event.url, title: event.title || getTitleFromUrl(event.url) });
      if (!state.applyingRemote) {
        state.socket.emit("tab:updateURL", { tabId: event.tabId, url: event.url, title: event.title || getTitleFromUrl(event.url) });
      }
    }

    if (event.type === "title") {
      updateLocalTab(event.tabId, { title: event.title, url: event.url });
      if (!state.applyingRemote) {
        state.socket.emit("tab:updateURL", { tabId: event.tabId, url: event.url, title: event.title });
      }
    }

    if (event.type === "new-window") {
      state.socket.emit("tab:create", { url: event.url });
    }
  });
}

function syncAll() {
  renderRoom();
  renderTabs();
  renderParticipants();
  renderMessages();
  syncBrowserViews(true);
}

function syncTabs(remote = false) {
  renderTabs();
  renderRoom();
  syncBrowserViews(remote);
}

function syncBrowserViews(remote = false) {
  state.applyingRemote = remote;
  window.miniBeam.tabs.sync(state.tabs, state.activeTabId).finally(() => {
    const activeTab = getActiveTab();
    if (activeTab) ui.addressInput.value = activeTab.url;
    setTimeout(() => {
      state.applyingRemote = false;
    }, 500);
  });
}

function renderRoom() {
  ui.roomLabel.textContent = state.roomCode ? `Комната ${state.roomCode}` : "MiniBeam";
  ui.inviteUrl.textContent = serverUrl;
}

function renderTabs() {
  ui.tabs.innerHTML = "";
  state.tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.className = `tab ${tab.id === state.activeTabId ? "active" : ""}`;
    button.type = "button";
    button.title = tab.url;
    button.innerHTML = `
      <span class="tab-dot"></span>
      <span class="tab-title">${escapeHtml(tab.title || "New tab")}</span>
      <span class="tab-close" title="Закрыть">×</span>
    `;
    button.addEventListener("click", () => state.socket.emit("tab:switch", { tabId: tab.id }));
    button.querySelector(".tab-close").addEventListener("click", (event) => {
      event.stopPropagation();
      state.socket.emit("tab:close", { tabId: tab.id });
    });
    ui.tabs.append(button);
  });

  const activeTab = getActiveTab();
  ui.addressInput.value = activeTab?.url || "";
}

function renderParticipants() {
  ui.onlineLabel.textContent = `${state.participants.length} онлайн`;
  ui.participants.innerHTML = "";
  state.participants.forEach((participant) => {
    const item = document.createElement("div");
    item.className = "participant";
    item.innerHTML = `
      <span class="avatar">${escapeHtml(getInitials(participant.name))}</span>
      <div>
        <strong>${escapeHtml(participant.name)}</strong>
        <small>${participant.online ? "online" : "offline"} · ${participant.role}</small>
      </div>
    `;
    ui.participants.append(item);
  });
}

function renderMessages() {
  ui.messages.innerHTML = "";
  state.messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = "message";
    item.innerHTML = `
      <strong>${escapeHtml(message.author)}</strong>
      <time>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      <p>${escapeHtml(message.text)}</p>
    `;
    ui.messages.append(item);
  });
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

function upsertTab(tab) {
  if (!tab) return;
  const index = state.tabs.findIndex((item) => item.id === tab.id);
  if (index === -1) state.tabs.push(tab);
  else state.tabs[index] = tab;
}

function updateLocalTab(tabId, patch) {
  const tab = state.tabs.find((item) => item.id === tabId);
  if (!tab) return;
  Object.assign(tab, patch);
  if (tabId === state.activeTabId && patch.url) ui.addressInput.value = patch.url;
  renderTabs();
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

function copyInvite(button, originalText) {
  window.miniBeam.copy(`${state.roomCode} ${serverUrl}`);
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
    return new URL(url).hostname.replace(/^www\./, "") || "New tab";
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
