# MiniBeam Architecture

MiniBeam is a local Hyperbeam-style room prototype. The host PC starts a local Node.js/Electron server, clients connect to it through Socket.IO, and the room synchronizes browser state, local video playback, participants, and chat.

## High-Level Scheme

```text
[Client 1: Electron room UI] ---\
[Client 2: Electron room UI] ----> [Local Host Server on PC]
[Client 3: Browser/Electron UI] -/             |
                                               |--> Express static client
                                               |--> Socket.IO realtime bus
                                               |--> Room state
                                               |--> Player state
                                               |--> Participants and chat
                                               |--> Optional hidden Chromium frame stream
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
- storing room state in memory;
- storing the current browser/player URL;
- storing playback state: `playing`, `currentTime`, `volume`, `updatedAt`;
- storing participants and recent chat messages;
- broadcasting room, player, browser, and chat events to all clients;
- cleaning temporary Electron profile data when the server closes.

## Client UI

The client is started by `03-start-client.bat`.

Main modules:

```text
src/renderer/index.html
src/renderer/styles.css
src/renderer/app.js
```

The client UI is shaped like a hosted browser room:

- left vertical room rail;
- central browser/player stage;
- Chrome-like tab and address bar;
- bottom control strip with participants and playback controls;
- right chat and invite panel.

The client connects to the local host server:

```js
const socket = io({ auth: { room: "ROOM-4821" } });
```

## Playback Modes

MiniBeam supports two playback concepts.

### Hosted Browser Mode

For normal websites, the host runs a hidden Chromium window. The client sees a frame stream and sends mouse, wheel, and keyboard input back to the host.

Events:

```text
browser:navigate
browser:back
browser:forward
browser:reload
browser:input
browser:state
browser:frame
```

### Local Player Sync Mode

For YouTube and direct HTML5 media URLs, video playback happens locally on each client. The server does not stream the video file. It only stores and broadcasts control state.

Events:

```text
player:load
player:play
player:pause
player:seek
player:volume
player:state
```

Player state shape:

```js
{
  mode: "player",
  url: "https://www.youtube.com/watch?v=...",
  provider: "youtube",
  playing: true,
  currentTime: 128.4,
  volume: 0.7,
  updatedAt: 1778370000000,
  controllerId: "socket-id"
}
```

When a new participant joins, the server sends `room:state` and `player:state`. The client opens the same media URL, applies volume, seeks to the synchronized time, and starts or pauses based on server state.

## Synchronization Logic

The server stores `currentTime` and `updatedAt`. If playback is active, live time is calculated from the last update:

```js
const elapsed = playing ? (Date.now() - updatedAt) / 1000 : 0;
const liveTime = currentTime + elapsed;
```

This lets late joiners and reconnecting clients land close to the current room position without the server streaming the media.

## Chat

Chat is delivered through Socket.IO.

Events:

```text
chat:message
room:state
```

The server keeps recent messages in memory for the active room. A newly connected client receives the current message list through `room:state`, then live messages through `chat:message`.

## Participants

Participants are tracked by Socket.IO connection id.

Each participant has:

```js
{
  id: "socket-id",
  name: "Guest 1",
  status: "Watching"
}
```

The client renders participants as avatars in the bottom control strip.

## Current MVP Limits

- YouTube control uses iframe postMessage commands and is best-effort.
- Direct HTML5 sync works best for `.mp4`, `.webm`, and `.ogg` URLs.
- Browser frame streaming is JPEG-over-Socket.IO for prototyping, not WebRTC yet.
- Audio capture from the hosted Chromium browser is not implemented yet.
- Permission roles are prepared conceptually, but strict host/trusted/viewer enforcement is not complete.
