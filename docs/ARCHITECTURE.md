# MiniBeam Architecture

MiniBeam is a local Hyperbeam-style browser room prototype. A local Node.js server keeps shared room state, and every Electron client renders the current web page in its own Chromium `webview`.

## High-Level Scheme

```text
[Electron Client 1: Chromium webview] ---\
[Electron Client 2: Chromium webview] ----> [Local Node.js Server]
[Electron Client 3: Chromium webview] ---/             |
                                                       |--> Express static files
                                                       |--> Socket.IO realtime bus
                                                       |--> Room state
                                                       |--> Browser URL and tabs
                                                       |--> Navigation history
                                                       |--> Participants and chat
```

## Files

```text
server.js      Node.js + Express + Socket.IO local server
main.js        Electron main process
preload.js     Safe bridge for server URL and clipboard
renderer.js    Browser UI, webview control, Socket.IO sync, chat
index.html     Client layout
styles.css     Dark Hyperbeam-like UI
launcher.js    Starts server and one Electron client for npm start
```

## Server

The server is started by:

```bash
npm run server
```

or by `02-start-server.bat`.

The server stores:

- room code;
- active tab id;
- tabs: title, URL, history, history index;
- participants;
- recent chat messages.

The server does not stream video and does not store video playback state. YouTube and direct video files are treated as normal web pages opened in Chromium.

## Client

The client is started by:

```bash
npm run client
```

or by `03-start-client.bat`.

The client contains:

- real Chromium `webview`;
- address bar;
- Back / Forward / Reload;
- synchronized tabs;
- participants panel;
- chat;
- invite buttons.

There are no video-player controls:

```text
No Play/Pause
No Seek
No Volume slider
No player:* protocol
```

## Socket.IO Protocol

Browser events:

```text
browser:navigate
browser:updateURL
browser:click
browser:input
browser:back
browser:forward
browser:reload
browser:tab:new
browser:tab:switch
browser:tab:close
browser:state
```

Room events:

```text
room:join
room:leave
room:state
room:participants
```

Chat events:

```text
chat:message
```

## New Participant Flow

```text
1. Client starts and connects to the local Socket.IO server.
2. Client emits room:join.
3. Server adds participant to the room.
4. Server sends room:state.
5. Client renders tabs, participants, chat history, and opens the current URL in webview.
```

`room:state` contains URL, tabs, navigation metadata, participants, and chat. It does not contain playback state.
