# MiniBeam

MiniBeam is a portable Electron prototype for a shared browser room.

The project is split into two parts:

- `02-start-server.bat` starts the host server on this PC. It runs a hidden Chromium browser, blocks common ad/tracker requests, captures the browser frame, and sends it to clients through Socket.IO.
- `03-start-client.bat` starts the Electron viewer. The viewer shows the hosted browser stream and sends mouse, keyboard, navigation, and chat events back to the host.

This is a local Hyperbeam-style MVP. It does not use an external cloud server: the shared browser is hosted on your PC.

## Run

Use the BAT files while the app is being patched:

- `01-install-deps.bat` installs dependencies.
- `02-start-server.bat` starts the local hosted-browser server.
- `03-start-client.bat` starts the Electron browser client.
- `04-check-code.bat` checks JavaScript syntax.
- `05-build-portable-exe.bat` is paused intentionally.

Manual commands:

```bash
npm install
npm run server
npm run client
```

## Build Portable EXE Later

When the app feels ready:

```bash
npm run dist
```

```text
fresh-release\MiniBeam.exe
```
