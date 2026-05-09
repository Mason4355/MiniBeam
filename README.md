# MiniBeam

MiniBeam is a portable Electron prototype for a shared browser room.

The app starts a local Express + Socket.IO server, creates a room code, and opens a native Chromium `BrowserView` inside the desktop window. Participants can join through the LAN/public IP URL and receive synchronized browser navigation, room state, participants, and chat.

This is not a cloud browser like Hyperbeam. Hyperbeam streams a remote virtual browser. MiniBeam is a local-browser prototype: each participant opens pages locally while the room syncs navigation and chat.

## Run

```bash
npm install
npm start
```

## Current Workflow

For now, use the BAT files while the app is being patched:

- `01-install-deps.bat` installs dependencies.
- `02-start-dev.bat` starts the development app.
- `03-check-code.bat` checks JavaScript syntax.
- `04-build-portable-exe.bat` is paused intentionally.

## Build Portable EXE Later

When the app feels ready:

```bash
npm run dist
```

```text
fresh-release\MiniBeam.exe
```
