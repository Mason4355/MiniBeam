const { spawn } = require("node:child_process");
const path = require("node:path");

const root = __dirname;
const env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: "",
  MINIBEAM_SERVER_URL: process.env.MINIBEAM_SERVER_URL || "http://127.0.0.1:3847"
};

const server = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env,
  stdio: "inherit"
});

setTimeout(() => {
  const electronBin = process.platform === "win32"
    ? path.join(root, "node_modules", ".bin", "electron.cmd")
    : path.join(root, "node_modules", ".bin", "electron");

  const client = spawn(electronBin, ["."], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  client.on("exit", () => {
    server.kill();
    process.exit(0);
  });
}, 900);

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});
