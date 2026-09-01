import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9223";
const targetUrl = process.argv[2] ?? "http://127.0.0.1:4173/";
const outputFile = resolve(process.argv[3] ?? "artifacts/teaser-cdp.png");
const width = Number(process.argv[4] ?? 390);
const height = Number(process.argv[5] ?? 844);

const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = targets.find((target) => target.type === "page");
if (!page?.webSocketDebuggerUrl) throw new Error("No debuggable Chromium page found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, reject) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandID = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++commandID;
  return new Promise((resolveCommand, reject) => {
    pending.set(id, { resolve: resolveCommand, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 600 });
await send("Page.navigate", { url: targetUrl });
await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
const metrics = await send("Runtime.evaluate", { expression: "({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth})", returnByValue: true });
if (metrics.result.value.width !== width || metrics.result.value.scrollWidth !== width) {
  throw new Error(`Unexpected viewport metrics: ${JSON.stringify(metrics.result.value)}`);
}
const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
await mkdir(resolve(outputFile, ".."), { recursive: true });
await writeFile(outputFile, Buffer.from(screenshot.data, "base64"));
socket.close();
console.log(`Captured ${width}x${height} viewport to ${outputFile}`);
