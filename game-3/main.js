// Walk through the pre-rendered views of a map. Each (cell, facing) is one image: the painted one when it exists
// (assets/views/x2z3-N.png), otherwise its colour-coded proxy (assets/proxies/sharp|blur/x2z3-N.png).
// Serve the repository root with any static server and open /game-3/index.html.
import * as map from '../tools/views/courtyard.mjs';
import { COLOURS } from '../tools/views/colours.mjs';
import { DIRS, SIDE_VEC } from '../tools/views/dirs.mjs';
import { createWorld, viewName } from './world.js';
import { legendEntries, coverage } from './legend.js';

const PAINTED = 'assets/views/';
const PROXY = 'assets/proxies/';
const world = createWorld(map);
const entries = legendEntries(map);

const $ = (id) => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const mapCanvas = $('map'), mctx = mapCanvas.getContext('2d');

let state = { ...map.start };
const hash = location.hash.slice(1).split(',');
if (hash.length === 3 && DIRS.includes(hash[2])) state = { x: +hash[0], z: +hash[1], dir: DIRS.indexOf(hash[2]) };
const q = new URLSearchParams(location.search);
let proxyOnly = q.has('proxy'), blurred = q.has('blur'), showLegend = true, showAll = false;

// ---------------------------------------------------------------- images
const cache = new Map();
function load(url) {
  if (!cache.has(url)) cache.set(url, new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = url; }));
  return cache.get(url);
}
const painted = new Set();
let ready = false; // set once the first view is drawn
for (const v of world.views) {
  const name = viewName(v);
  load(`${PAINTED}${name}.png`).then((im) => {
    if (!im) return;
    painted.add(name); drawMap(); progress();
    if (name === viewName(state) && ready) show(false); // the view on screen just turned out to be painted
  });
}
const progress = () => { $('progress').textContent = `${painted.size} / ${world.views.length} painted`; };

// ---------------------------------------------------------------- drawing
let token = 0, last = null;
async function show(fade = true) {
  const my = ++token, name = viewName(state);
  const wantPainted = !proxyOnly && painted.has(name);
  const im = await load(wantPainted ? `${PAINTED}${name}.png` : `${PROXY}${blurred ? 'blur' : 'sharp'}/${name}.png`);
  if (my !== token) return;
  const from = last && fade ? last : null;
  const t0 = performance.now();
  const frame = (now) => {
    if (my !== token) return;
    const t = from ? Math.min(1, (now - t0) / 140) : 1;
    ctx.globalAlpha = 1;
    if (from) ctx.drawImage(from, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = t;
    if (im) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#fff'; ctx.fillText(`missing ${name}`, 20, 40); }
    ctx.globalAlpha = 1;
    if (t < 1) requestAnimationFrame(frame);
    else { last = document.createElement('canvas'); last.width = canvas.width; last.height = canvas.height; last.getContext('2d').drawImage(canvas, 0, 0); }
  };
  requestAnimationFrame(frame);
  $('where').innerHTML = `cell <b>(${state.x}, ${state.z})</b> facing <b>${DIRS[state.dir]}</b>`;
  $('source').textContent = wantPainted ? 'painted' : blurred ? 'proxy (blurred)' : 'proxy';
  drawMap();
  renderLegend(name);
}

// ---------------------------------------------------------------- minimap
function drawMap() {
  const rows = map.tiles.length, cols = map.tiles[0].length, s = Math.min(mapCanvas.width / cols, mapCanvas.height / rows);
  mctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  const colourOf = (ch) => COLOURS[map.wallInfo?.[ch]?.colour ?? (ch === '#' ? 'wall-stone' : `wall-${ch}`)] ?? [90, 90, 90];
  map.tiles.forEach((row, z) => [...row].forEach((ch, x) => {
    const c = ch === '.' ? [58, 51, 80] : colourOf(ch).map((v) => v * 0.7);
    mctx.fillStyle = `rgb(${c})`; mctx.fillRect(x * s + 1, z * s + 1, s - 2, s - 2);
  }));
  for (const e of map.entities ?? []) {
    const sv = SIDE_VEC[e.side], c = COLOURS[e.prop] ?? [200, 200, 200];
    mctx.fillStyle = `rgb(${c})`; mctx.strokeStyle = '#000'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc((e.x + 0.5 + sv[0] * 0.33) * s, (e.z + 0.5 + sv[1] * 0.33) * s, s * 0.11, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
  }
  for (const v of world.views) { // painted / proxy tick on the side each facing looks at
    const sv = SIDE_VEC[DIRS[v.dir]], cx = (v.x + 0.5) * s, cz = (v.z + 0.5) * s;
    mctx.fillStyle = painted.has(viewName(v)) ? '#58e07a' : '#8a7fa8';
    const w = s * 0.34, t = s * 0.07, ox = cx + sv[0] * (s / 2 - t * 1.6), oz = cz + sv[1] * (s / 2 - t * 1.6);
    mctx.fillRect(sv[0] ? ox - t / 2 : ox - w / 2, sv[1] ? oz - t / 2 : oz - w / 2, sv[0] ? t : w, sv[1] ? t : w);
  }
  const px = (state.x + 0.5) * s, pz = (state.z + 0.5) * s, f = SIDE_VEC[DIRS[state.dir]], r = s * 0.24;
  mctx.save(); mctx.translate(px, pz); mctx.rotate(Math.atan2(f[1], f[0]) + Math.PI / 2);
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.moveTo(0, -r); mctx.lineTo(r * 0.8, r * 0.8); mctx.lineTo(-r * 0.8, r * 0.8); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
}

// ---------------------------------------------------------------- legend
const covers = new Map();
async function coverageOf(name) {
  if (!covers.has(name)) {
    covers.set(name, (async () => {
      const im = await load(`${PROXY}sharp/${name}.png`);
      if (!im) return new Map();
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(im, 0, 0, 320, 180);
      const d = x.getImageData(0, 0, 320, 180);
      return coverage(d.data, 320, 180, entries);
    })());
  }
  return covers.get(name);
}
async function renderLegend(name) {
  $('legendBox').hidden = !showLegend;
  if (!showLegend) return;
  const share = await coverageOf(name);
  if (viewName(state) !== name) return;
  const list = entries.map((e) => ({ e, p: share.get(e.key) ?? 0 })).filter((x) => showAll || x.p >= 0.005).sort((a, b) => b.p - a.p);
  $('legend').innerHTML = '';
  for (const { e, p } of list) {
    const li = document.createElement('li');
    li.title = e.text; if (p >= 0.3 && !['sky', 'floor'].includes(e.key)) li.className = 'big'; if (p < 0.005) li.className = 'off';
    li.innerHTML = `<span class="sw" style="background:rgb(${e.rgb})"></span><span>${e.label}</span><span class="pc">${p >= 0.005 ? Math.round(p * 100) + '%' : ''}</span>`;
    $('legend').append(li);
  }
}

// ---------------------------------------------------------------- input
const KEYS = { ArrowUp: 'forward', w: 'forward', ArrowDown: 'back', s: 'back', a: 'left', d: 'right', ArrowLeft: 'turnLeft', q: 'turnLeft', ArrowRight: 'turnRight', e: 'turnRight' };
addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  if (KEYS[k]) {
    ev.preventDefault();
    const r = world.act(state, KEYS[k]);
    if (r.moved) { state = r.state; history.replaceState(null, '', `#${state.x},${state.z},${DIRS[state.dir]}`); show(); }
  } else if (k === 'l') { showLegend = !showLegend; show(false); }
  else if (k === 'g') { showAll = !showAll; renderLegend(viewName(state)); }
  else if (k === 'p') { proxyOnly = !proxyOnly; show(false); }
  else if (k === 'b') { blurred = !blurred; show(false); }
});

ready = true;
progress(); drawMap(); show(false);
