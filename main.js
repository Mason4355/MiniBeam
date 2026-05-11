const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { app, BrowserView, BrowserWindow, Menu, ipcMain, session } = require("electron");

const runtimeDir = path.join(os.tmpdir(), `MiniBeamClient-${process.pid}`);
const serverUrl = process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847";
const viewPartitionPrefix = `minibeam-${process.pid}`;

let mainWindow;
let activeTabId = "";
let browserBounds = { x: 0, y: 74, width: 950, height: 604 };
const views = new Map();
const adBlockedSessions = new WeakSet();

const blockedDomains = [
  "2mdn.net",
  "3lift.com",
  "ad.gt",
  "ad-delivery.net",
  "ad-score.com",
  "ad-stir.com",
  "adblade.com",
  "adbutler.com",
  "adform.net",
  "adfox.ru",
  "adkernel.com",
  "adlightning.com",
  "admanmedia.com",
  "admarvel.com",
  "adnami.io",
  "adnxs.com",
  "adroll.com",
  "ads-twitter.com",
  "ads.linkedin.com",
  "adsafeprotected.com",
  "adskeeper.com",
  "advertising.com",
  "advertising.yandex.ru",
  "adsrvr.org",
  "adtech.de",
  "adtechus.com",
  "adtrue.com",
  "adtelligent.com",
  "adzerk.net",
  "amazon-adsystem.com",
  "amplitude.com",
  "analytics.google.com",
  "app-measurement.com",
  "appsflyer.com",
  "betweendigital.com",
  "bidr.io",
  "bidswitch.net",
  "bluekai.com",
  "bounceexchange.com",
  "casalemedia.com",
  "chartbeat.com",
  "contextweb.com",
  "criteo.com",
  "criteo.net",
  "demdex.net",
  "doubleclick.net",
  "flashtalking.com",
  "facebook.net",
  "gemius.pl",
  "google-analytics.com",
  "googleadservices.com",
  "googlesyndication.com",
  "googletagmanager.com",
  "googletagservices.com",
  "gstaticadssl.l.google.com",
  "hotjar.com",
  "imasdk.googleapis.com",
  "impact.com",
  "imrworldwide.com",
  "indexexchange.com",
  "innovid.com",
  "intentiq.com",
  "lijit.com",
  "liveintent.com",
  "marketgid.com",
  "mathtag.com",
  "media.net",
  "mgid.com",
  "moatads.com",
  "mxptint.net",
  "omtrdc.net",
  "openx.net",
  "optimizely.com",
  "outbrain.com",
  "popads.net",
  "popcash.net",
  "postrelease.com",
  "pubmatic.com",
  "quantserve.com",
  "revcontent.com",
  "rubiconproject.com",
  "scorecardresearch.com",
  "segment.io",
  "sharethrough.com",
  "smartadserver.com",
  "spotx.tv",
  "spotxchange.com",
  "taboola.com",
  "tapad.com",
  "teads.tv",
  "tidaltv.com",
  "tremorhub.com",
  "tribalfusion.com",
  "turn.com",
  "vidoomy.com",
  "videologygroup.com",
  "weborama.fr",
  "xandr.com",
  "yieldmo.com",
  "yieldlab.net",
  "yldbt.com",
  "zedo.com",
  "yandexadexchange.net"
];

const blockedUrlPatterns = [
  /(^|[/?&_.-])adserver([/?&_.-]|$)/i,
  /(^|[/?&_.-])adservice([/?&_.-]|$)/i,
  /(^|[/?&_.-])ad(s|x)?track(ing)?([/?&_.-]|$)/i,
  /(^|[/?&_.-])adsbygoogle([/?&_.-]|$)/i,
  /(^|[/?&_.-])ads?[/?&_.-]/i,
  /(^|[/?&_.-])advert(s|ising)?([/?&_.-]|$)/i,
  /(^|[/?&_.-])banner(s)?[/?&_.-]/i,
  /(^|[/?&_.-])ima3?([/?&_.-]|$)/i,
  /(^|[/?&_.-])outstream([/?&_.-]|$)/i,
  /(^|[/?&_.-])(pre|mid|post)roll([/?&_.-]|$)/i,
  /(^|[/?&_.-])prebid([/?&_.-]|$)/i,
  /(^|[/?&_.-])sponsor(ed)?([/?&_.-]|$)/i,
  /(^|[/?&_.-])tracking([/?&_.-]|$)/i,
  /(^|[/?&_.-])utm_pixel([/?&_.-]|$)/i,
  /(^|[/?&_.-])vast([/?&_.-]|$)/i,
  /(^|[/?&_.-])vpaid([/?&_.-]|$)/i
];

const adCleanerScript = `
(() => {
  if (window.__minibeamAdCleanerInstalled) return;
  window.__minibeamAdCleanerInstalled = true;

  const blockedHosts = ${JSON.stringify(blockedDomains)};
  const exactSelectors = [
    "#player-ads",
    "#masthead-ad",
    "#merch-shelf",
    "ytd-ad-slot-renderer",
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-video-renderer",
    "ytd-rich-section-renderer",
    ".video-ad-container",
    ".video-ads",
    ".ytp-ad-module",
    ".ytp-ad-overlay-container",
    ".ytp-ad-player-overlay",
    ".ytp-ad-skip-button-container",
    ".ytp-ad-text",
    ".ytp-ad-preview-container",
    ".ytp-ad-survey",
    ".ad-container",
    ".ads-container",
    ".advertisement",
    ".advertising",
    ".banner-ad",
    ".popup-ad",
    ".overlay-ad",
    ".sponsor",
    ".sponsored",
    ".sponsored-content",
    ".native-ad",
    ".outstream-ad",
    ".companion-ad",
    ".preroll-ad",
    ".midroll-ad",
    ".postroll-ad",
    ".vast-ad",
    ".vpaid-ad",
    "[aria-label*='advertisement' i]",
    "[aria-label*='реклама' i]",
    "[id^='google_ads_']",
    "[id*='google_ads']",
    "[id*='doubleclick']",
    "[class*='doubleclick']",
    "iframe[id*='google_ads']",
    "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
    "iframe[src*='googleadservices.com']"
  ];

  const broadSelectors = [".ad", ".ads", "[class~='ad']", "[class~='ads']", "[id~='ad']", "[id~='ads']"];
  const adWords = /(^|[-_\\s])(ad|ads|adv|advert|advertising|sponsor|sponsored|banner|promo|promoted|preroll|midroll|postroll|outstream|vast|vpaid|doubleclick|googlesyndication)([-_\\s]|$)/i;
  const protectedMedia = "video,audio,canvas,svg,object,embed";

  function hostIsBlocked(rawUrl) {
    try {
      const host = new URL(rawUrl, location.href).hostname.replace(/^www\\./, "").toLowerCase();
      return blockedHosts.some((domain) => host === domain || host.endsWith("." + domain));
    } catch {
      return false;
    }
  }

  function hasProtectedContent(element) {
    if (!element || element.nodeType !== 1) return true;
    if (element.matches(protectedMedia)) return true;
    return Boolean(element.querySelector(protectedMedia));
  }

  function isExplicitAd(element) {
    if (!element || element.nodeType !== 1 || hasProtectedContent(element)) return false;
    if (element.tagName === "IFRAME" && hostIsBlocked(element.src)) return true;
    const marker = [element.id, element.className, element.getAttribute("aria-label"), element.getAttribute("data-testid")]
      .filter(Boolean)
      .join(" ");
    return adWords.test(marker);
  }

  function isOverlayAd(element) {
    if (!isExplicitAd(element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const zIndex = Number.parseInt(style.zIndex || "0", 10) || 0;
    const area = rect.width * rect.height;
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    const fixed = style.position === "fixed" || style.position === "sticky";
    return fixed || zIndex >= 1000 || area / viewportArea > 0.12;
  }

  function removeElement(element) {
    if (!element || element.dataset?.minibeamRemoved === "1") return;
    if (hasProtectedContent(element)) return;
    element.dataset.minibeamRemoved = "1";
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.remove();
  }

  function clean(root = document) {
    ensureStyle();
    skipVideoAds();

    for (const selector of exactSelectors) {
      root.querySelectorAll?.(selector).forEach((element) => {
        if (isExplicitAd(element) || selector.includes("ytp-ad") || selector.includes("video-ad")) removeElement(element);
      });
    }

    for (const selector of broadSelectors) {
      root.querySelectorAll?.(selector).forEach((element) => {
        if (isOverlayAd(element)) removeElement(element);
      });
    }

    root.querySelectorAll?.("iframe").forEach((iframe) => {
      if (hostIsBlocked(iframe.src)) removeElement(iframe);
    });
  }

  const scheduleClean = (() => {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        clean(document);
      });
    };
  })();

  function ensureStyle() {
    if (document.getElementById("minibeam-ad-cleaner-style")) return;
    const style = document.createElement("style");
    style.id = "minibeam-ad-cleaner-style";
    style.textContent = exactSelectors.join(",") + "{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}";
    document.documentElement.appendChild(style);
  }

  function skipVideoAds() {
    document.querySelectorAll(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, button[class*='skip'], button[aria-label*='Skip' i], button[aria-label*='Пропустить' i]").forEach((button) => {
      try { button.click(); } catch {}
    });

    document.querySelectorAll(".ad-showing video, video[class*='ad']").forEach((video) => {
      try {
        video.muted = true;
        video.playbackRate = 16;
        if (Number.isFinite(video.duration) && video.duration > 1) video.currentTime = Math.max(0, video.duration - 0.25);
      } catch {}
    });
  }

  clean(document);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (isOverlayAd(node) || (node.tagName === "IFRAME" && hostIsBlocked(node.src))) removeElement(node);
          clean(node);
        }
      }
    }
    scheduleClean();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("load", scheduleClean, { once: true });
  setInterval(scheduleClean, 2500);
})();
`;

fs.mkdirSync(runtimeDir, { recursive: true });
app.setPath("userData", runtimeDir);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");
app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
configureWidevineFromInstalledBrowser();

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("before-quit", cleanup);

async function createWindow() {
  Menu.setApplicationMenu(null);
  installAdBlock(session.defaultSession);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1120,
    minHeight: 680,
    title: "MiniBeam",
    backgroundColor: "#111217",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("resize", updateActiveViewBounds);
  mainWindow.on("maximize", updateActiveViewBounds);
  mainWindow.on("unmaximize", updateActiveViewBounds);
  mainWindow.on("leave-full-screen", () => {
    sendBrowserEvent("html-fullscreen", { fullscreen: false });
    updateActiveViewBounds();
  });
}

ipcMain.handle("tabs:sync", async (_event, tabs = [], nextActiveTabId = "") => {
  const knownIds = new Set(tabs.map((tab) => tab.id));
  for (const [tabId, view] of views.entries()) {
    if (!knownIds.has(tabId)) {
      try {
        if (mainWindow?.getBrowserView() === view) mainWindow.setBrowserView(null);
        view.webContents.close({ waitForBeforeUnload: false });
      } catch {}
      views.delete(tabId);
    }
  }

  for (const tab of tabs) {
    const view = ensureView(tab);
    const currentUrl = view.webContents.getURL();
    if (tab.url && currentUrl !== tab.url) {
      try {
        await view.webContents.loadURL(tab.url);
      } catch {}
    }
  }

  if (nextActiveTabId) setActiveView(nextActiveTabId);
});

ipcMain.handle("browser:navigate", async (_event, tabId, url) => {
  const view = views.get(tabId || activeTabId);
  if (!view || !url) return;
  await view.webContents.loadURL(url);
});

ipcMain.handle("browser:back", () => {
  const view = views.get(activeTabId);
  if (view?.webContents.canGoBack()) view.webContents.goBack();
});

ipcMain.handle("browser:forward", () => {
  const view = views.get(activeTabId);
  if (view?.webContents.canGoForward()) view.webContents.goForward();
});

ipcMain.handle("browser:reload", () => {
  views.get(activeTabId)?.webContents.reload();
});

ipcMain.handle("layout:set-browser-bounds", (_event, nextBounds = {}) => {
  const scale = mainWindow?.webContents.getZoomFactor() || 1;
  browserBounds = {
    x: Math.max(0, Math.round(Number(nextBounds.x || 0) * scale)),
    y: Math.max(0, Math.round(Number(nextBounds.y || 0) * scale)),
    width: Math.max(320, Math.round(Number(nextBounds.width || 320) * scale)),
    height: Math.max(240, Math.round(Number(nextBounds.height || 240) * scale))
  };
  updateActiveViewBounds();
});

function ensureView(tab) {
  if (views.has(tab.id)) return views.get(tab.id);

  const partition = `${viewPartitionPrefix}-${tab.id}`;
  const viewSession = session.fromPartition(partition);
  installAdBlock(viewSession);

  const view = new BrowserView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      plugins: true
    }
  });

  view.webContents.setUserAgent(
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
  );

  view.webContents.setWindowOpenHandler(({ url }) => {
    sendBrowserEvent("new-window", { tabId: tab.id, url });
    return { action: "deny" };
  });

  view.webContents.on("enter-html-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      sendBrowserEvent("html-fullscreen", { fullscreen: true });
      setTimeout(updateActiveViewBounds, 120);
    }
  });
  view.webContents.on("leave-html-full-screen", () => {
    sendBrowserEvent("html-fullscreen", { fullscreen: false });
    setTimeout(updateActiveViewBounds, 120);
  });
  view.webContents.on("did-start-loading", () => sendBrowserEvent("loading", { tabId: tab.id, loading: true }));
  view.webContents.on("did-stop-loading", () => {
    sendBrowserEvent("loading", { tabId: tab.id, loading: false });
    sendNavigationState(tab.id);
    injectAdCleaner(view);
  });
  view.webContents.on("dom-ready", () => injectAdCleaner(view));
  view.webContents.on("did-navigate", (_event, url) => reportNavigation(tab.id, url));
  view.webContents.on("did-navigate-in-page", (_event, url) => reportNavigation(tab.id, url));
  view.webContents.on("page-title-updated", (_event, title) => {
    sendBrowserEvent("title", { tabId: tab.id, title, url: view.webContents.getURL() });
  });

  views.set(tab.id, view);
  return view;
}

function setActiveView(tabId) {
  const view = views.get(tabId);
  if (!mainWindow || !view) return;
  activeTabId = tabId;
  mainWindow.setBrowserView(view);
  updateActiveViewBounds();
  sendNavigationState(tabId);
}

function updateActiveViewBounds() {
  const view = views.get(activeTabId);
  if (!mainWindow || !view) return;
  view.setBounds(browserBounds);
  view.setAutoResize({ width: true, height: true });
}

function injectAdCleaner(view) {
  if (!view || view.webContents.isDestroyed()) return;
  view.webContents.executeJavaScript(adCleanerScript, true).catch(() => {});
}

function installAdBlock(targetSession) {
  if (!targetSession || adBlockedSessions.has(targetSession)) return;
  adBlockedSessions.add(targetSession);

  targetSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (shouldBlockRequest(details.url, details.resourceType)) {
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });
}

function shouldBlockRequest(rawUrl, resourceType) {
  if (resourceType === "mainFrame") return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const domainBlocked = blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (domainBlocked) return true;

  if (resourceType === "media") return false;
  const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase();
  return blockedUrlPatterns.some((pattern) => pattern.test(pathAndQuery));
}

function configureWidevineFromInstalledBrowser() {
  const widevine = findWidevineCdm();
  if (!widevine) return;
  app.commandLine.appendSwitch("widevine-cdm-path", widevine.dllPath);
  app.commandLine.appendSwitch("widevine-cdm-version", widevine.version);
}

function findWidevineCdm() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "";
  const candidates = [
    path.join(localAppData, "Google", "Chrome", "User Data", "WidevineCdm"),
    path.join(localAppData, "Microsoft", "Edge", "User Data", "WidevineCdm"),
    path.join(programFiles, "Google", "Chrome", "Application", "WidevineCdm"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "WidevineCdm"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "WidevineCdm"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "WidevineCdm")
  ];

  for (const baseDir of candidates) {
    const version = getLatestVersionDirectory(baseDir);
    if (!version) continue;
    const dllPath = path.join(baseDir, version, "_platform_specific", "win_x64", "widevinecdm.dll");
    if (fs.existsSync(dllPath)) return { dllPath, version };
  }
  return null;
}

function getLatestVersionDirectory(baseDir) {
  try {
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareVersions)
      .pop();
  } catch {
    return "";
  }
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  const max = Math.max(a.length, b.length);
  for (let index = 0; index < max; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function reportNavigation(tabId, url) {
  const view = views.get(tabId);
  sendBrowserEvent("navigated", { tabId, url, title: view?.webContents.getTitle() || "" });
  sendNavigationState(tabId);
}

function sendNavigationState(tabId) {
  const view = views.get(tabId);
  sendBrowserEvent("navigation-state", {
    tabId,
    canGoBack: view?.webContents.canGoBack() || false,
    canGoForward: view?.webContents.canGoForward() || false
  });
}

function sendBrowserEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browser:event", { type, ...payload });
}

async function cleanup() {
  for (const view of views.values()) {
    try {
      view.webContents.stop();
      view.webContents.close({ waitForBeforeUnload: false });
    } catch {}
  }
  views.clear();
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
  } catch {}
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  } catch {}
}
