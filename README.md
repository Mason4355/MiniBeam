# MiniBeam

MiniBeam is a local Hyperbeam-style MVP: one PC starts a small Node.js room server, and Electron clients connect to it as synchronized browser windows.

It is a browser room, not a video player. There are no Play/Pause, volume, seek bars, or custom video controls. Pages, YouTube, and direct HTML5 video links open inside Electron Chromium through `BrowserView`.

## What Is Inside

- `server.js` - local Express + Socket.IO room server.
- `main.js` - Electron main process with embedded Chromium `BrowserView` tabs.
- `preload.js` - safe bridge between Electron and the UI.
- `renderer.js` - tabs, address bar, participants, chat, and Socket.IO sync.
- `index.html` + `styles.css` - dark Hyperbeam-like browser interface.

The server stores room state: tabs, active tab, URL history, participants, and chat. New clients receive `room:state` and immediately see the current room.

## BAT Files

- `01-install-deps.bat` - install dependencies.
- `02-start-server.bat` - start the local sync server.
- `03-start-client.bat` - start one Electron client.
- `04-check-code.bat` - check JavaScript syntax.
- `05-build-portable-exe.bat` - build `fresh-release\MiniBeam.exe` later.

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
