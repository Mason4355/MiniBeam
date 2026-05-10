# MiniBeam

MiniBeam is a portable Electron prototype for a shared browser room.

The project is split into two parts:

- `server.js` starts the local Node.js + Express + Socket.IO room server.
- `main.js` starts the Electron client.
- `renderer.js` controls the browser UI, tabs, URL synchronization, participants, and chat.

This is a local Hyperbeam-style MVP. It does not use an external cloud server. Every client renders pages through Electron Chromium and synchronizes room browser state through the local server.

## Run

Use the BAT files while the app is being patched:

- `01-install-deps.bat` installs dependencies.
- `02-start-server.bat` starts the local synchronization server.
- `03-start-client.bat` starts the Electron browser client.
- `04-check-code.bat` checks JavaScript syntax.
- `05-build-portable-exe.bat` is paused intentionally.

Manual commands:

```bash
npm install
npm run server
npm run client
```

Or start one local server plus one client together:

```bash
npm start
```

## Build Portable EXE Later

When the app feels ready:

```bash
npm run dist
```

```text
fresh-release\MiniBeam.exe
```
