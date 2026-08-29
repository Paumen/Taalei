// Rendert elk model uit een groepenbestand vanuit drie standpunten naast elkaar:
// vooraanzicht driekwart, de tegenoverliggende driekwart, en recht langs de as.
// Eén vaste camera verbergt precies de fout waar deze sheets over gaan.
//
//   node tools/vergelijk-groottes/render-banden.mjs tools/vergelijk-groottes/groepen-banden.json docs/asset_review_banden
//
// Anders dan render.mjs staat hier niet de schaal maar de kleur centraal: elk
// model vult zijn eigen tegel.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, "..", "..");
const THREE = path.join(execSync("npm root -g").toString().trim(), "three");
const [bron, uit] = process.argv.slice(2);
mkdirSync(uit, { recursive: true });
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const drie = p.startsWith("/three/");
  const basis = drie ? THREE : ROOT;
  const fp = path.normalize(path.join(basis, drie ? p.slice(7) : p));
  if (!fp.startsWith(basis + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(fp) || !statSync(fp).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(fp)] || "application/octet-stream",
  });
  createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(8932, r));
const groups = JSON.parse(readFileSync(bron, "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1260, height: 420 } });
page.on("pageerror", (e) => console.log(" [fout]", e.message));
for (const [g, { items }] of Object.entries(groups)) {
  for (const it of items) {
    const naam = it.pad
      .replace("workfiles/", "")
      .replace(/\//g, "__")
      .replace(".glb", "");
    await page.goto(
      `http://127.0.0.1:8932/tools/vergelijk-groottes/banden-close.html?m=${encodeURIComponent("/kits/" + it.pad)}`,
    );
    await page.waitForFunction("window.KLAAR===true", null, { timeout: 30000 });
    await page.screenshot({ path: path.join(uit, `${g}--${naam}.png`) });
  }
  console.log("ok", g);
}
await browser.close();
server.close();
