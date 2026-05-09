const path = require("node:path");
const { createRoomServer } = require("./room-server");

const port = Number(process.env.MINIBEAM_PORT || 3847);
const staticDir = path.join(__dirname, "..", "renderer");
const server = createRoomServer({ staticDir });

server.start(port).then((info) => {
  console.log("");
  console.log("MiniBeam room server is running");
  console.log(`Room code: ${info.roomCode}`);
  console.log(`Local URL: ${info.localUrl}`);
  console.log(`LAN URL:   ${info.lanUrl}`);
  console.log("");
  console.log("Keep this window open while clients are connected.");
});

async function stop() {
  await server.stop();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
