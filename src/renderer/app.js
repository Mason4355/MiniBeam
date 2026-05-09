const elements = {
  roomTitle: document.querySelector("#roomTitle"),
  serverUrl: document.querySelector("#serverUrl"),
  copyRoomButton: document.querySelector("#copyRoomButton"),
  participantCount: document.querySelector("#participantCount"),
  participants: document.querySelector("#participants"),
  browserForm: document.querySelector("#browserForm"),
  homeSearchForm: document.querySelector("#homeSearchForm"),
  addressInput: document.querySelector("#addressInput"),
  homeSearchInput: document.querySelector("#homeSearchInput"),
  roomBrowser: document.querySelector("#roomBrowser"),
  homeScreen: document.querySelector("#homeScreen"),
  browserStatus: document.querySelector("#browserStatus"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  homeButton: document.querySelector("#homeButton"),
  copyUrlButton: document.querySelector("#copyUrlButton"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

const state = {
  roomCode: "",
  inviteUrl: "",
  socket: null,
  selfId: "",
  currentUrl: "",
  syncingNavigation: false,
  browserReady: Boolean(elements.roomBrowser?.loadURL)
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
  wireBrowser();

  if (!state.browserReady) {
    elements.browserStatus.textContent = "Встроенный браузер доступен только в Electron";
  }
}

function wireSocket() {
  state.socket.on("room:error", (message) => {
    elements.browserStatus.textContent = message;
  });

  state.socket.on("room:state", (room) => {
    state.selfId = room.selfId;
    renderParticipants(room.participants);
    renderMessages(room.messages);
    if (room.browserUrl) {
      navigateBrowser(room.browserUrl, false);
    }
  });

  state.socket.on("participants:update", renderParticipants);
  state.socket.on("browser:navigate", (url) => navigateBrowser(url, false));
  state.socket.on("chat:message", appendMessage);
}

function wireUi() {
  elements.copyRoomButton.addEventListener("click", async () => {
    await window.miniBeam.copyText(`${state.roomCode} ${state.inviteUrl}`);
    flashButton(elements.copyRoomButton, "Скопировано", "Скопировать код");
  });

  elements.copyUrlButton.addEventListener("click", async () => {
    await window.miniBeam.copyText(state.currentUrl || state.inviteUrl);
    flashButton(elements.copyUrlButton, "Скопировано", "Копировать ссылку");
  });

  elements.browserForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigateBrowser(elements.addressInput.value, true);
  });

  elements.homeSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    navigateBrowser(elements.homeSearchInput.value, true);
  });

  document.querySelectorAll("[data-url]").forEach((button) => {
    button.addEventListener("click", () => navigateBrowser(button.dataset.url, true));
  });

  elements.backButton.addEventListener("click", () => {
    if (state.browserReady && elements.roomBrowser.canGoBack()) {
      elements.roomBrowser.goBack();
    }
  });

  elements.forwardButton.addEventListener("click", () => {
    if (state.browserReady && elements.roomBrowser.canGoForward()) {
      elements.roomBrowser.goForward();
    }
  });

  elements.reloadButton.addEventListener("click", () => {
    if (state.browserReady && state.currentUrl) {
      elements.roomBrowser.reload();
    }
  });

  elements.homeButton.addEventListener("click", () => showHome());

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    state.socket.emit("chat:message", message);
    elements.chatInput.value = "";
  });
}

function wireBrowser() {
  if (!state.browserReady) return;

  elements.roomBrowser.addEventListener("did-start-loading", () => {
    elements.browserStatus.textContent = "Загрузка...";
  });

  elements.roomBrowser.addEventListener("did-stop-loading", () => {
    elements.browserStatus.textContent = "Готово";
    updateNavigationButtons();
  });

  elements.roomBrowser.addEventListener("did-navigate", (event) => handleBrowserUrl(event.url));
  elements.roomBrowser.addEventListener("did-navigate-in-page", (event) => handleBrowserUrl(event.url));

  elements.roomBrowser.addEventListener("page-title-updated", (event) => {
    const title = event.title || "New tab";
    document.querySelector(".tab.active").textContent = title.slice(0, 38);
  });
}

function navigateBrowser(value, shouldBroadcast) {
  const url = normalizeUrl(value);
  if (!url) return;

  state.currentUrl = url;
  elements.addressInput.value = url;
  elements.homeScreen.hidden = true;

  if (!state.browserReady) {
    elements.browserStatus.textContent = "Откройте эту комнату в MiniBeam.exe";
    return;
  }

  state.syncingNavigation = !shouldBroadcast;
  elements.roomBrowser.src = url;

  if (shouldBroadcast) {
    state.socket.emit("browser:navigate", url);
  }
}

function handleBrowserUrl(url) {
  if (!url || url === "about:blank") return;

  state.currentUrl = url;
  elements.addressInput.value = url;
  updateNavigationButtons();

  if (state.syncingNavigation) {
    state.syncingNavigation = false;
    return;
  }

  state.socket.emit("browser:navigate", url);
}

function showHome() {
  state.currentUrl = "";
  elements.addressInput.value = "";
  elements.homeSearchInput.value = "";
  elements.homeScreen.hidden = false;
  elements.browserStatus.textContent = "Готово";
  if (state.browserReady) {
    elements.roomBrowser.src = "about:blank";
  }
}

function updateNavigationButtons() {
  if (!state.browserReady) {
    elements.backButton.disabled = true;
    elements.forwardButton.disabled = true;
    elements.reloadButton.disabled = true;
    return;
  }

  elements.backButton.disabled = !elements.roomBrowser.canGoBack();
  elements.forwardButton.disabled = !elements.roomBrowser.canGoForward();
  elements.reloadButton.disabled = !state.currentUrl;
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

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (text.includes(".") && !text.includes(" ")) {
    return `https://${text}`;
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
}

function flashButton(button, text, originalText) {
  button.textContent = text;
  setTimeout(() => {
    button.textContent = originalText;
  }, 1300);
}

function createGuestName() {
  return `Guest ${Math.floor(100 + Math.random() * 900)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
