# MiniBeam Architecture

MiniBeam is a local Hyperbeam-style browser room prototype. The host PC starts a local Node.js/Electron server, clients connect through Socket.IO, and everyone sees and controls the same hosted Chromium browser.

## High-Level Scheme

```text
[Client 1: Electron room UI] ---\
[Client 2: Electron room UI] ----> [Local Host Server on PC]
[Client 3: Browser/Electron UI] -/             |
                                               |--> Express static client
                                               |--> Socket.IO realtime bus
                                               |--> Room state
                                               |--> Browser URL and tabs
                                               |--> Participants and chat
                                               |--> Hidden Chromium frame stream
```

## Host Server

The host process is started by `02-start-server.bat`.

Main modules:

```text
src/host/host-main.js
src/server/room-server.js
```

Runtime stack:

```text
Electron
Node.js
Express
Socket.IO
Hidden Chromium BrowserWindow
```

The host server is responsible for:

- creating a temporary room code such as `ROOM-4821`;
- serving the client UI over HTTP;
- accepting Socket.IO connections;
- running the shared Chromium browser locally on the host PC;
- storing room state in memory;
- storing the current browser URL, title, tabs, participants, and recent chat;
- broadcasting browser, room, participant, and chat events to all clients;
- cleaning temporary Electron profile data when the server closes.

## Client UI

The client is started by `03-start-client.bat`.

Main modules:

```text
src/renderer/index.html
src/renderer/styles.css
src/renderer/app.js
```

The client UI is a full browser room, not a video player:

- left vertical room rail;
- central shared Chromium browser stage;
- Chrome-like tabs;
- address bar;
- Back, Forward, Reload controls;
- extension/menu icons;
- bottom room strip with participants and invite button;
- right chat and invite panel.

There are no video-specific controls:

```text
No Play/Pause button
No Seek range
No Volume range
No local video player state
No player:* protocol
```

YouTube, direct `.mp4`, `.webm`, `.ogg`, and normal web pages are opened through the same hosted Chromium browser path.

## Socket.IO Events

Browser events:

```text
browser:navigate
browser:new-tab
browser:back
browser:forward
browser:reload
browser:input
browser:state
browser:frame
```

Room and chat events:

```text
room:state
chat:message
```

When a new participant joins, the server sends `room:state` with:

```js
{
  roomCode: "ROOM-4821",
  browserUrl: "https://youtube.com",
  title: "YouTube",
  tabs: [
    { id: "tab-1", title: "YouTube", url: "https://youtube.com", active: true }
  ],
  participants: [],
  messages: [],
  blockedCount: 0
}
```

The new participant receives the current URL, visible tabs, participant list, and chat history. No playback state is sent.

## Browser Input

Clients do not open websites locally in their own iframes. Instead, the host PC owns the actual Chromium instance.

The client sends input events:

```text
mouseDown
mouseUp
mouseMove
mouseWheel
keyDown
keyUp
```

The host forwards these events into the hidden Chromium `webContents` and broadcasts captured browser frames back to all clients.

## Current MVP Limits

- Tabs are represented in room state, but the host currently runs one active Chromium webContents.
- Frame streaming is JPEG-over-Socket.IO for prototyping, not WebRTC yet.
- Hosted Chromium audio capture is not implemented yet.
- Permission roles are not strict yet; all connected clients can control the shared browser.
