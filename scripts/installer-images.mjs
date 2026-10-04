// Renders the images the Windows installers show (NSIS header and sidebar, MSI banner
// and dialog) from src-tauri/app-icon.svg into src-tauri/installer/*.bmp.
//
//   node scripts/installer-images.mjs
//
// Needs Chrome or Edge; set CHROME to its path if it is not in the usual place.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "src-tauri", "installer");
const svg = fs.readFileSync(path.join(root, "src-tauri", "app-icon.svg"), "utf8");
const chromePath = process.env.CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
if (!chromePath) throw new Error("Chrome or Edge not found; set CHROME to its path");

// name, width, height, and how to paint it: a blue panel `strip` pixels wide on the left
// (0 = white background only) with the app icon `icon` pixels wide, placed at `at`.
const IMAGES = [
  { name: "nsis-header", w: 150, h: 57, strip: 0, icon: 40, at: "right" },
  { name: "nsis-sidebar", w: 164, h: 314, strip: 164, icon: 96, at: "center", label: true },
  { name: "wix-banner", w: 493, h: 58, strip: 0, icon: 40, at: "right" },
  { name: "wix-dialog", w: 493, h: 312, strip: 164, icon: 96, at: "center", label: true },
];

const page = `<canvas id="c"></canvas><script>
async function draw(spec, svg) {
  const c = document.getElementById("c"); c.width = spec.w; c.height = spec.h;
  const g = c.getContext("2d");
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, spec.w, spec.h);
  if (spec.strip) {
    const grad = g.createLinearGradient(0, 0, spec.strip, spec.h);
    grad.addColorStop(0, "#1B7BD6"); grad.addColorStop(1, "#00478C");
    g.fillStyle = grad; g.fillRect(0, 0, spec.strip, spec.h);
  }
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;base64," + btoa(svg); });
  const panel = spec.strip || spec.w;
  const x = spec.at === "right" ? spec.w - spec.icon - 10 : (panel - spec.icon) / 2;
  const y = spec.at === "right" ? (spec.h - spec.icon) / 2 : spec.h * 0.3 - spec.icon / 2;
  g.drawImage(img, x, y, spec.icon, spec.icon);
  if (spec.label) {
    g.fillStyle = "#FFFFFF"; g.textAlign = "center";
    g.font = "600 22px 'Segoe UI', sans-serif"; g.fillText("Joinery", panel / 2, y + spec.icon + 34);
    g.font = "12px 'Segoe UI', sans-serif"; g.globalAlpha = 0.85; g.fillText("Database schema designer", panel / 2, y + spec.icon + 56);
  }
  return Array.from(g.getImageData(0, 0, spec.w, spec.h).data);
}
</script>`;

// 24-bit uncompressed BMP, rows stored bottom-up and padded to four bytes.
function bmp(w, h, rgba) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write("BM"); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3;
    buf[d] = rgba[s + 2]; buf[d + 1] = rgba[s + 1]; buf[d + 2] = rgba[s];
  }
  return buf;
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "joinery-chrome-"));
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=9341", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try { const list = await (await fetch("http://127.0.0.1:9341/json")).json(); ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl); } catch { await sleep(250); }
}
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Page.navigate", { url: "data:text/html," + encodeURIComponent(page) });
await sleep(500);
fs.mkdirSync(outDir, { recursive: true });
for (const spec of IMAGES) {
  const r = await send("Runtime.evaluate", { expression: `draw(${JSON.stringify(spec)}, ${JSON.stringify(svg)})`, awaitPromise: true, returnByValue: true });
  if (!r.result.result.value) throw new Error("Could not draw " + spec.name + ": " + JSON.stringify(r.result));
  fs.writeFileSync(path.join(outDir, spec.name + ".bmp"), bmp(spec.w, spec.h, r.result.result.value));
  console.log("wrote src-tauri/installer/" + spec.name + ".bmp");
}
ws.close(); chrome.kill();
process.exit(0);
