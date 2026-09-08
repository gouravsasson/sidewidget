import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = process.env.DEV_PORT || "5173";
const cloudflaredCommand = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const children = new Set();
let stopping = false;

function start(command, args, label) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
  });

  children.add(child);
  child.once("error", (error) => {
    console.error(`[${label}] Could not start: ${error.message}`);
    if (label === "tunnel" && error.code === "ENOENT") {
      console.error(
        "Install cloudflared first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
      );
    }
    stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[${label}] stopped (${signal || `exit ${code ?? 1}`}).`);
      stop(code || 1);
    }
  });

  return child;
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
}

console.log(`Starting Snowie widget locally on port ${port}...`);
start(process.execPath, [viteCli, "--port", port], "vite");

console.log("Opening a public HTTPS Quick Tunnel...");
start(
  cloudflaredCommand,
  ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
  "tunnel",
);

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
