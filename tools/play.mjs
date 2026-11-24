#!/usr/bin/env node
// Let a bot play a campaign without a screen, many times, and write what happened. See docs/engine/bots.md.
//
//   node tools/play.mjs --bot fighter --scenario undercrypt --runs 200 --out reports/fighter.json --csv reports/fighter.csv
//   node tools/play.mjs --bot ./my-bot.mjs --level dungeon --at 1,1,2 --runs 50
//   node tools/play.mjs --bot explorer --scenario undercrypt --seed 17 --runs 1 --trace       one run, every event printed
//   node tools/play.mjs compare reports/before.json reports/after.json
//
// Options:
//   --campaign <path>   the campaign module (default games/ravensmoor/campaign.js); it exports `campaign`, and may
//                       export `scenarios` from <campaign dir>/scenarios.js
//   --bot <name|path>   an example bot from tools/bots/ (random-walker, explorer, fighter, caster) or a module of your own
//   --scenario <name|path>  a scenario from the campaign's scenarios.js, or a .json/.mjs file (its default export)
//   --level <id>, --at x,z,dir   start here instead (on top of the scenario)
//   --runs <n> (100), --seed <n> (1): run i uses seed + i
//   --max-time <s> (600): a run that lasts longer is a timeout
//   --sample <s> (10): the progress curve's step
//   --respawn           wake at the respawn point after death instead of ending the run
//   --option key=value  passed to the bot as memory.options (numbers parsed)
//   --out <file.json>, --csv <file.csv>   write the report (runs and summary) and one CSV row per run
//   --trace             keep every event of every run in the report (use with few runs); with --runs 1, print them
//   --quiet             no per-run lines
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runBots, toCsv, compareReports, MEASURES } from '../engine/sim/runner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function usage(message) {
  if (message) console.error(`play: ${message}`);
  console.error('usage: node tools/play.mjs --bot <name|path> [--scenario <name|path>] [--runs n] [--seed n] [--out f.json] [--csv f.csv]\n       node tools/play.mjs compare <before.json> <after.json>');
  process.exit(2);
}

if (args[0] === 'compare') {
  if (args.length !== 3) usage('compare needs two report files');
  const [a, b] = args.slice(1).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const rows = compareReports(a, b).filter(r => r.delta !== 0 || /Rate$/.test(r.metric));
  const width = Math.max(...rows.map(r => r.metric.length));
  console.log(`${'metric'.padEnd(width)}  ${'before'.padStart(10)}  ${'after'.padStart(10)}  ${'delta'.padStart(10)}  change`);
  for (const r of rows) console.log(`${r.metric.padEnd(width)}  ${String(r.before ?? '-').padStart(10)}  ${String(r.after ?? '-').padStart(10)}  ${String(r.delta).padStart(10)}  ${r.change}`);
  process.exit(0);
}

const opts = { runs: 100, seed: 1, 'max-time': 600, sample: 10, campaign: 'games/ravensmoor/campaign.js', option: [] };
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, '');
  if (!args[i].startsWith('--')) usage(`unexpected "${args[i]}"`);
  if (['respawn', 'trace', 'quiet'].includes(key)) { opts[key] = true; continue; }
  const value = args[++i];
  if (value === undefined) usage(`--${key} needs a value`);
  if (key === 'option') opts.option.push(value); else opts[key] = value;
}
if (!opts.bot) usage('which bot? --bot fighter');

const load = async file => (await import(pathToFileURL(path.resolve(file)).href));
const campaignFile = path.resolve(ROOT, opts.campaign);
const { campaign } = await load(campaignFile);
if (!campaign) usage(`${opts.campaign} does not export a campaign`);

const botFile = /[/.]/.test(opts.bot) ? path.resolve(opts.bot) : path.join(ROOT, 'tools/bots', `${opts.bot}.mjs`);
if (!fs.existsSync(botFile)) usage(`no bot at ${botFile}`);
const bot = (await load(botFile)).default;

let scenario = { ...(bot.scenario ?? {}) };
if (opts.scenario) {
  const named = path.join(path.dirname(campaignFile), 'scenarios.js');
  if (/\.json$/.test(opts.scenario)) scenario = JSON.parse(fs.readFileSync(opts.scenario, 'utf8'));
  else if (/[/.]/.test(opts.scenario)) scenario = (await load(opts.scenario)).default;
  else if (fs.existsSync(named)) {
    const { scenarios } = await load(named);
    if (!scenarios?.[opts.scenario]) usage(`no scenario "${opts.scenario}" in ${path.relative(ROOT, named)} (there are: ${Object.keys(scenarios ?? {}).join(', ')})`);
    scenario = scenarios[opts.scenario];
  } else usage(`the campaign has no scenarios.js for "${opts.scenario}"`);
}
if (opts.level) scenario = { ...scenario, level: opts.level, at: undefined };
if (opts.at) { const [x, z, dir = 0] = opts.at.split(',').map(Number); scenario = { ...scenario, at: { x, z, dir } }; }
const botOptions = Object.fromEntries(opts.option.map(o => { const [k, v] = o.split('='); return [k, v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v]; }));

const runs = Number(opts.runs), started = Date.now();
const report = await runBots({
  campaign, bot, scenario, botOptions, runs, seed: Number(opts.seed), maxMs: Number(opts['max-time']) * 1000,
  sampleMs: Number(opts.sample) * 1000, respawn: !!opts.respawn, trace: !!opts.trace,
  onRun: opts.quiet ? null : (run, i) => console.log(`run ${String(i + 1).padStart(String(runs).length)}  seed ${run.seed}  ${run.outcome.padEnd(7)}  ${(run.time / 1000).toFixed(0).padStart(4)} s  kills ${run.kills}  hp ${run.hpEnd}/${run.maxHp}  taken ${run.damageTaken}  potions ${run.potionsUsed}  loot ${run.lootItems}${run.deathBy ? `  killed by ${run.deathBy}` : ''}`),
});
report.scenario = opts.scenario ?? null;

if (opts.trace && runs === 1) for (const e of report.runs[0].trace) {
  const { type, t, level, ...rest } = e;
  console.log(`${(t / 1000).toFixed(2).padStart(8)}  ${level.padEnd(10)}  ${type.padEnd(13)}  ${rest.text ?? JSON.stringify(rest)}`);
}

const s = report.summary;
console.log(`\n${bot.name} × ${runs} on ${campaign.title}${opts.scenario ? ` (${opts.scenario})` : ''}, seeds ${opts.seed}–${Number(opts.seed) + runs - 1}, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(`outcomes ${JSON.stringify(s.outcomes)}  survival ${(s.survivalRate * 100).toFixed(0)}%  wins ${(s.winRate * 100).toFixed(0)}%`);
for (const m of MEASURES) if (s.measures[m]) console.log(`  ${m.padEnd(15)} mean ${String(s.measures[m].mean).padStart(9)}  median ${String(s.measures[m].median).padStart(9)}  min ${String(s.measures[m].min).padStart(8)}  max ${String(s.measures[m].max).padStart(8)}`);
if (Object.keys(s.deathsBy).length) console.log(`  killed by ${Object.entries(s.deathsBy).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  kills per run ${Object.entries(s.killsByKind).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}`);
console.log(`  loot per run  ${Object.entries(s.loot).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}`);

for (const [file, text] of [[opts.out, () => JSON.stringify(report, null, 1)], [opts.csv, () => toCsv(report.runs)]]) {
  if (!file) continue;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, text());
  console.log(`wrote ${file}`);
}
