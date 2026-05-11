# MiniBeam

MiniBeam is a local Hyperbeam-style MVP: one PC starts a small Node.js room server, and Electron clients connect to it as synchronized browser windows.

It is a browser room, not a video player. There are no Play/Pause, volume, seek bars, or custom video controls. Pages, YouTube, and direct HTML5 video links open inside Electron Chromium through `WebContentsView` with a Chrome-compatible user agent.

## What Is Inside

- `server.js` - local Express + Socket.IO room server.
- `main.js` - Electron main process with embedded Chromium `WebContentsView` tabs.
- `preload.js` - safe bridge between Electron and the UI.
- `renderer.js` - tabs, address bar, participants, chat, and Socket.IO sync.
- `index.html` + `styles.css` - dark Hyperbeam-like browser interface.

The server stores room state: tabs, active tab, URL history, participants, and chat. New clients receive `room:state` and immediately see the current room.

Electron blocks common advertising and tracker domains through `session.webRequest.onBeforeRequest`. A lightweight injected cleaner also removes obvious ad iframes, side banners, video ad overlays, and dynamically inserted ad nodes through `MutationObserver`. The blocker skips main-frame navigation and avoids removing elements that contain `video`, `audio`, `canvas`, `object`, or `embed`, so HTML5 players are less likely to break.

When a site enters HTML fullscreen, MiniBeam expands the browser area while keeping the tab bar and address bar visible.

MiniBeam uses Electron Chromium, so normal HTML5 video sites such as YouTube, Vimeo, Dailymotion, and direct `.mp4/.webm/.ogg` links render through Chromium. On Windows it also tries to reuse an installed Chrome/Edge Widevine CDM if one is present. Electron still cannot embed the full installed Google Chrome browser as an in-app view; it can only run its bundled Chromium engine.

## BAT Files

- `01-install-deps.bat` - install dependencies.
- `02-start-server.bat` - start the local sync server.
- `03-start-client.bat` - start one Electron client.
- `04-check-code.bat` - check JavaScript syntax.
- `05-build-portable-exe.bat` - build `fresh-release\MiniBeam.exe` later.
- `06-test-two-clients.bat` - clean old MiniBeam processes, check code, start one server, and open two clients for sync testing.
- `00-stop-clean.bat` - stop MiniBeam server/client processes from this project and remove temp runtime folders.

For testing several clients, keep `02-start-server.bat` open and run `03-start-client.bat` multiple times.

## Manual Run

```bash
npm install
npm run server
npm run client
```

Or start one server and one client together:

```bash
npm start
```

## Check

```bash
npm run check
```

## Portable Build Later

```bash
npm run dist
```

The build result will be:

```text
fresh-release\MiniBeam.exe
```
