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
  homeScreen: document.querySelector("#homeScreen"),
  browserStatus: document.querySelector("#browserStatus"),
  backButton: document.querySelector("#backButton"),
  forwardButton: document.querySelector("#forwardButton"),
  reloadButton: document.querySelector("#reloadButton"),
  homeButton: document.querySelector("#homeButton"),
  copyUrlButton: document.querySelector("#copyUrlButton"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomLabel: document.querySelector("#zoomLabel"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  errorOverlay: document.querySelector("#errorOverlay"),
  errorText: document.querySelector("#errorText"),
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
  zoomFactor: 1,
  lastBroadcastUrl: "",
  browserReady: Boolean(window.miniBeam?.browserNavigate)
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
  wireNativeBrowser();
  updateNavigationButtons({ canGoBack: false, canGoForward: false });

  if (!state.browserReady) {
    elements.browserStatus.textContent = "Встроенный браузер доступен только в MiniBeam.exe";
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
    if (state.browserReady) window.miniBeam.browserBack();
  });

  elements.forwardButton.addEventListener("click", () => {
    if (state.browserReady) window.miniBeam.browserForward();
  });

  elements.reloadButton.addEventListener("click", () => {
    if (state.browserReady && state.currentUrl) window.miniBeam.browserReload();
  });

  elements.homeButton.addEventListener("click", () => showHome());
  elements.zoomOutButton.addEventListener("click", () => setZoom(state.zoomFactor - 0.1));
  elements.zoomInButton.addEventListener("click", () => setZoom(state.zoomFactor + 0.1));

  window.miniBeam.onOpenUrl((url) => navigateBrowser(url, true));

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    state.socket.emit("chat:message", message);
    elements.chatInput.value = "";
  });
}

function wireNativeBrowser() {
  if (!state.browserReady) return;

  window.miniBeam.onBrowserEvent((event) => {
    if (event.type === "loading") {
      elements.browserStatus.textContent = event.loading ? "Загрузка..." : "Готово";
      elements.loadingOverlay.hidden = true;
      return;
    }

    if (event.type === "load-error") {
      window.miniBeam.browserHome();
      elements.homeScreen.hidden = false;
      elements.errorOverlay.hidden = false;
      elements.errorText.textContent = event.errorDescription || "Попробуйте обновить или открыть другую ссылку.";
      elements.browserStatus.textContent = "Ошибка загрузки";
      return;
    }

    if (event.type === "new-window") {
      navigateBrowser(event.url, true);
      return;
    }

    if (event.type === "title") {
      const title = event.title || "New tab";
      const tab = document.querySelector(".tab.active");
      tab.textContent = title;
      tab.title = title;
      return;
    }

    if (event.type === "navigation-state") {
      updateNavigationButtons(event);
      return;
    }

    if (event.type === "navigated") {
      handleBrowserUrl(event.url);
    }
  });
}

async function navigateBrowser(value, shouldBroadcast) {
  const url = normalizeUrl(value);
  if (!url) return;

  state.currentUrl = url;
  elements.addressInput.value = url;
  elements.homeScreen.hidden = true;
  elements.errorOverlay.hidden = true;
  elements.loadingOverlay.hidden = true;

  if (!state.browserReady) {
    elements.browserStatus.textContent = "Откройте эту комнату в MiniBeam.exe";
    return;
  }

  state.syncingNavigation = !shouldBroadcast;
  await window.miniBeam.browserNavigate(url);

  if (shouldBroadcast) {
    state.lastBroadcastUrl = url;
    state.socket.emit("browser:navigate", url);
  }
}

function handleBrowserUrl(url) {
  if (!url || url === "about:blank") return;

  state.currentUrl = url;
  elements.addressInput.value = url;

  if (state.syncingNavigation) {
    state.syncingNavigation = false;
    return;
  }

  if (url === state.lastBroadcastUrl) return;
  state.lastBroadcastUrl = url;
  state.socket.emit("browser:navigate", url);
}

function showHome() {
  state.currentUrl = "";
  elements.addressInput.value = "";
  elements.homeSearchInput.value = "";
  elements.homeScreen.hidden = false;
  elements.loadingOverlay.hidden = true;
  elements.errorOverlay.hidden = true;
  elements.browserStatus.textContent = "Готово";
  if (state.browserReady) {
    window.miniBeam.browserHome();
  }
}

function updateNavigationButtons(navigationState) {
  elements.backButton.disabled = !navigationState?.canGoBack;
  elements.forwardButton.disabled = !navigationState?.canGoForward;
  elements.reloadButton.disabled = !state.currentUrl;
}

function setZoom(nextZoom) {
  state.zoomFactor = Math.min(1.4, Math.max(0.7, Number(nextZoom.toFixed(1))));
  elements.zoomLabel.textContent = `${Math.round(state.zoomFactor * 100)}%`;
  if (state.browserReady) {
    window.miniBeam.browserZoom(state.zoomFactor);
  }
}

function renderParticipants(participants) {
  elements.participantCount.textContent = participants.length;
  elements.participants.innerHTML = participants.map((participant) => `
    <article class="participant" title="${escapeHtml(participant.name)}: ${escapeHtml(participant.status)}">
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
