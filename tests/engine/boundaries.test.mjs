import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The engine is the rule book, a campaign is a setting: imports go one way only. Nothing in engine/ may reach into
// a campaign, an experiment or the tools, and a campaign uses the engine only through engine/index.js.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sources = dir => fs.readdirSync(path.join(ROOT, dir), { recursive: true })
  .filter(f => /\.(m?js|html|css)$/.test(f)).map(f => path.join(dir, f));
const imports = file => {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8'), out = [];
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|new URL\(\s*|url\(\s*)['"`](\.{1,2}\/[^'"`$]*)['"`]/g)) {
    out.push(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), m[1])));
  }
  return out;
};

test('the engine imports nothing from campaigns, experiments or tools', () => {
  for (const file of sources('engine')) for (const target of imports(file)) {
    assert.ok(!/^(games|experiments|tools|art)\//.test(target), `${file} imports ${target}`);
  }
});

test('campaigns use the engine through engine/index.js only', () => {
  for (const file of sources('games')) for (const target of imports(file)) {
    if (target.startsWith('engine/')) assert.equal(target, 'engine/index.js', `${file} imports ${target}`);
    assert.ok(!/^(experiments|tools)\//.test(target), `${file} imports ${target}`);
  }
});
