// ビルド後に dist/sw.js の事前キャッシュ一覧とバージョンを埋め込む
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");

// Vite が出力したハッシュ付きアセット（/jinkei-lab/assets/xxx.js など）を拾う
const assets = [...html.matchAll(/(?:src|href)="\/jinkei-lab\/(assets\/[^"]+)"/g)].map((m) => `./${m[1]}`);

const shell = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  ...assets,
];

const version = createHash("sha256").update(shell.join("\n")).digest("hex").slice(0, 10);
const swPath = new URL("sw.js", dist);
const sw = readFileSync(swPath, "utf8")
  .replaceAll("__VERSION__", version)
  .replaceAll("__PRECACHE__", JSON.stringify(shell, null, 2));
writeFileSync(swPath, sw);
console.log(`sw.js: version=${version}, precache=${shell.length} files`);
