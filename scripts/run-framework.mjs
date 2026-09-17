import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
const windowsLocalDev = process.platform === "win32" && command === "dev";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
// Corporate Windows policies may block workerd.exe, which vinext uses for its
// local Cloudflare runtime. Next's native dev server provides the same app and
// API route development loop without starting workerd. Builds still use vinext.
const cli = new URL(windowsLocalDev
  ? "../node_modules/next/dist/bin/next"
  : managedLinux
    ? "../node_modules/vite/bin/vite.js"
    : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
