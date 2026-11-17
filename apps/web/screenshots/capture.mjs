// Regenerates docs/screenshot.png, the README picture: the real app (desktop, dark;
// phone, light) rendered with invented data from demo.tsx, framed by showcase.html.
//
//   1. npm run dev          (the dev server must be running on :3000)
//   2. npm run screenshot
//
// Uses a local Chrome or Edge in headless mode; set CHROME=/path/to/chrome to pick one.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const out = fileURLToPath(new URL("../../../docs/screenshot.png", import.meta.url));
const candidates = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const chrome = candidates.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chrome or Edge found. Set CHROME=/path/to/chrome.");
  process.exit(1);
}

try {
  await fetch("http://localhost:3000/screenshots/showcase.html");
} catch {
  console.error("The dev server isn't running: start it with `npm run dev`, then try again.");
  process.exit(1);
}

execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  "--window-size=1720,960",
  // Room for both frames to load, one after the other.
  "--virtual-time-budget=20000",
  `--screenshot=${out}`,
  "http://localhost:3000/screenshots/showcase.html",
], { stdio: "ignore" });

console.log(`${path.relative(process.cwd(), out)} (${Math.round(statSync(out).size / 1024)} KB)`);
