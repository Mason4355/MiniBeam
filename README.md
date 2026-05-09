# MiniBeam

MiniBeam is a portable Electron MVP for watching a shared video together. The app runs a local Node.js + Express + Socket.IO server and synchronizes only playback events, room state, participants, and chat.

## What This Prototype Does

- Starts and stops the local server with Electron.
- Creates a temporary room code like `ROOM-4821`.
- Lets friends join via `http://PUBLIC_IP:PORT/?room=ROOM-4821`.
- Plays the same video locally for each participant.
- Relays `play`, `pause`, `seek`, `volume`, and chat messages through Socket.IO.
- Keeps room data in memory only.

## Quick Start

```bash
npm install
npm start
```

The host window opens at `1280x720`. The app shows the local server URL and room code in the top bar.

## Windows BAT Shortcuts

You can use the `.bat` files in the project root instead of typing commands:

- `01-install-deps.bat` installs dependencies.
- `02-start-dev.bat` starts the app for testing.
- `03-check-code.bat` checks JavaScript syntax.
- `04-build-portable-exe.bat` builds `release\MiniBeam.exe`.

## Testing On One Machine

1. Run `npm start`.
2. Copy the server URL shown in the app, for example `http://192.168.1.24:3750/?room=ROOM-4821`.
3. Open that URL in another browser window or another Electron instance.
4. Paste a direct video URL or a YouTube URL in the host app.
5. Try play, pause, seek, volume, and chat.

## Testing Over Public IP

- Forward the displayed port from your router to the host machine.
- Share `http://PUBLIC_IP:PORT/?room=ROOM-4821`.
- The room code hides the room identity, but it does not hide the server address from network traffic.
- For real production use, add HTTPS, authentication, rate limits, NAT traversal guidance, and stronger room secrets.

## Project Structure

```text
src/
  main/
    main.js          Electron main process. Starts/stops the server.
  preload/
    preload.js       Safe bridge from Electron to the renderer.
  renderer/
    index.html       App shell.
    styles.css       Dark minimal UI.
    app.js           Client state, video controls, chat, Socket.IO.
  server/
    server.js        Express + Socket.IO room server.
```

## Portable Build

```bash
npm run check
npx electron-builder --win portable
```

The portable executable appears at `release\MiniBeam.exe`.
