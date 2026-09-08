import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const widgetDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const workspaceDirectory = path.resolve(widgetDirectory, "..");
const frontendDirectory = path.join(
  workspaceDirectory,
  "snowie",
  "multimodel-closerx",
);
const backendDirectory = path.join(
  workspaceDirectory,
  "snowie",
  "Dental_Backend",
);

const localEnv = loadEnv("development", widgetDirectory, "");
const tunnelId = (
  process.env.SNOWIE_TUNNEL_ID || localEnv.SNOWIE_TUNNEL_ID
)?.trim();
const tunnelRegion = (
  process.env.SNOWIE_TUNNEL_REGION ||
  localEnv.SNOWIE_TUNNEL_REGION ||
  "inc1"
).trim();

if (!tunnelId) {
  console.error(
    "SNOWIE_TUNNEL_ID is required. Copy .env.example to .env and set it to the persistent tunnel ID created during the one-time setup in README.md.",
  );
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]{2,59}$/i.test(tunnelId)) {
  console.error("SNOWIE_TUNNEL_ID must contain only letters, numbers, and hyphens.");
  process.exit(1);
}

const publicUrl = (port) =>
  `https://${tunnelId}-${port}.${tunnelRegion}.devtunnels.ms`;
const backendUrl = publicUrl(8000);
const frontendUrl = publicUrl(5175);
const widgetUrl = publicUrl(5173);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const devTunnelCommand =
  process.platform === "win32" ? "devtunnel.exe" : "devtunnel";
const bundledPython = path.join(
  backendDirectory,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const pythonCommand = existsSync(bundledPython)
  ? bundledPython
  : process.platform === "win32"
    ? "python.exe"
    : "python3";

const children = new Set();
let stopping = false;

function start(command, args, label, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

  children.add(child);
  child.once("error", (error) => {
    console.error(`[${label}] Could not start: ${error.message}`);
    if (label === "tunnel" && error.code === "ENOENT") {
      console.error(
        "Install the Microsoft devtunnel CLI and complete the one-time setup in sidewidget/README.md.",
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
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 500);
}

console.log("Starting Snowie development services with fixed public URLs:");
console.log(`  Backend:  ${backendUrl}`);
console.log(`  Frontend: ${frontendUrl}`);
console.log(`  Widget:   ${widgetUrl}`);

start(
  pythonCommand,
  ["manage.py", "runserver", "0.0.0.0:8000"],
  "backend",
  backendDirectory,
  {
    MODE: process.env.MODE || "dev",
    SNOWIE_PUBLIC_BASE_URL: backendUrl,
    SNOWIE_FRONTEND_URL: frontendUrl,
    SNOWIE_WIDGET_URL: widgetUrl,
    SNOWIE_SDK_URL: `${widgetUrl}/sdk.js`,
    SNOWIE_DEV_TUNNEL_HOSTS: new URL(backendUrl).hostname,
  },
);

start(npmCommand, ["run", "dev"], "frontend", frontendDirectory, {
  VITE_BASE_URL: `${backendUrl}/api/`,
  VITE_COMMERCE_API_URL: backendUrl,
  VITE_COMMERCE_SDK_URL: `${widgetUrl}/sdk.js`,
  VITE_WIDGET_URL: widgetUrl,
});

start(npmCommand, ["run", "dev"], "widget", widgetDirectory, {
  VITE_SNOWIE_API_URL: backendUrl,
});

start(devTunnelCommand, ["host", tunnelId], "tunnel", workspaceDirectory);

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
