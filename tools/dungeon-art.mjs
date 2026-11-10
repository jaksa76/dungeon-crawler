#!/usr/bin/env node
// Slice the generated dungeon sheets with the same view/atlas geometry as the
// existing town templates. Run: node tools/dungeon-art.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(ROOT, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const files = await page.evaluate(async () => {
    const { createView } = await import('/engine2d/view.js');
    const { makePlan, sceneRect, sceneCellAt } = await import('/tools/studio2d/plan.js');
    const view = createView(), { W, H } = view.V;
    const plan = makePlan(view, { wallArts: ['dungeon-stone', 'dungeon-door'], propArts: [] });
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const load = src => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
    });
    function keyOut(g) {
      const pixels = g.getImageData(0, 0, W, H), d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        // Hard alpha avoids pink fringes when the art is reduced to game pixels.
        if (d[i] > d[i + 1] + 65 && d[i + 2] > d[i + 1] + 65) d[i + 3] = 0;
      }
      g.putImageData(pixels, 0, 0);
    }
    const out = {};
    for (const sheet of plan.sheets) {
      const image = await load(`/game-2/art/painted/${sheet.name}.png`);
      for (const [i, scene] of sheet.scenes.entries()) {
        const r = sceneRect(i, view, plan.sheet);
        const source = canvas(W, H), g = source.getContext('2d');
        g.drawImage(image, r.x, r.y, r.w, r.h, 0, 0, W, H); keyOut(g);
        const items = view.compose(sceneCellAt(scene));
        for (const harvest of scene.harvest) {
          const item = items.find(it => it.slot.id === harvest.id && it.l === harvest.l);
          const p = view.placed(item), c = canvas(p.w, p.h), cg = c.getContext('2d');
          if (item.mirror) { cg.translate(p.w, 0); cg.scale(-1, 1); }
          cg.beginPath(); p.poly.forEach(([x, y], n) => n ? cg.lineTo(x - p.x, y - p.y) : cg.moveTo(x - p.x, y - p.y));
          cg.closePath(); cg.clip(); cg.drawImage(source, -p.x, -p.y);
          out[`walls/${scene.art}/${harvest.id}.png`] = c.toDataURL();
        }
      }
    }
    const floor = await load('/game-2/art/painted/floor-dungeon.png');
    const c = canvas(W, H), g = c.getContext('2d');
    const h = H * plan.sheet.w / W;
    g.drawImage(floor, 0, (plan.sheet.h - h) / 2, plan.sheet.w, h, 0, 0, W, H); keyOut(g);
    out['floor.png'] = c.toDataURL();
    return out;
  });
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(ROOT, 'game-2/dungeon/assets', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(`Sliced ${Object.keys(files).length} dungeon assets.`);
} finally { await browser.close(); server.close(); }
