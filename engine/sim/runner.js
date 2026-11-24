// Run a bot many times and measure what happened: who survived, how long fights took, what was found. One run is one
// simulation (simulation.js) with its own seed (seed, seed + 1, ...), so a report can be made again exactly and any one
// run replayed on its own. See docs/engine/bots.md for the bot interface and the report.
import { createSimulation } from './simulation.js';
import { createRng } from '../core/rng.js';

// A bot: { name, description?, scenario?, start?(sim, memory), act(sim, memory), done?(sim, memory) }. act() is called
// until the run is over; each call should take at least one action (one that took no game time is followed by a
// 100 ms wait). done() true ends the run as won. `memory` is an empty object per run, for the bot's own notes, with
// `options` (what the runner was given as botOptions) and `random` (the bot's own seeded chance).
export async function runBot({ campaign, bot, seed = 1, scenario = bot.scenario ?? {}, maxMs = 10 * 60_000, sampleMs = 10_000,
  respawn = false, botOptions = {}, trace = false, tickMs, pace } = {}) {
  if (typeof bot?.act !== 'function') throw new Error('a bot needs an act(sim, memory) method');
  const sim = await createSimulation({ campaign, seed, scenario, respawn, tickMs, pace });
  const metrics = collect(sim);
  // The bot's own chance, apart from the game's, so a bot that rolls dice does not change how the fights go.
  const memory = { options: botOptions, random: createRng(`bot:${seed}`) };
  await bot.start?.(sim, memory);
  let nextSample = 0;
  const sample = () => { while (sim.time >= nextSample) { metrics.sample(nextSample); nextSample += sampleMs; } };
  sample();
  while (!sim.over && sim.time < maxMs) {
    const before = sim.time;
    await bot.act(sim, memory);
    if (sim.time === before && !sim.over) sim.wait(100);
    if (!sim.over && (await bot.done?.(sim, memory) || await scenario.goal?.(sim))) sim.stop('won');
    sample();
  }
  return metrics.finish(sim.outcome ?? 'timeout', { seed, trace });
}

// Many runs: { runs: [...], summary }. `onRun(run, i)` is told about each as it finishes.
export async function runBots({ runs = 100, seed = 1, onRun, ...options } = {}) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const run = await runBot({ ...options, seed: seed + i });
    results.push(run);
    onRun?.(run, i);
  }
  return { bot: options.bot.name ?? 'bot', campaign: options.campaign.title ?? '', seed, runs: results, summary: summarise(results, options.sampleMs ?? 10_000) };
}

// What one run is measured by, from the session's events.
function collect(sim) {
  const items = sim.session.itemDefs;
  const run = {
    kills: 0, killsByKind: {}, attacks: 0, hits: 0, misses: 0, damageDealt: 0, damageTaken: 0, blowsTaken: 0, evaded: 0,
    potionsUsed: 0, itemsUsed: 0, loot: {}, lootItems: 0, lootValue: 0, xp: 0, xpByKind: {}, dropValue: 0, dropValueByKind: {}, dropBudgetByKind: {}, deaths: 0, deathBy: null, timeToKill: [],
    levels: {}, curve: [], hpMin: sim.hero.hp, firstLevelUp: null,
  };
  const levelOf = id => (run.levels[id] ??= { time: 0, kills: 0, xp: 0, damageDealt: 0, damageTaken: 0, lootItems: 0, lootValue: 0, dropValue: 0, explored: 0 });
  const firstBlow = new Map(); // creature id -> when the hero first swung at it
  let levelSince = 0;
  levelOf(sim.level);
  const trace = [];
  sim.on('*', event => {
    trace.push(event);
    const here = levelOf(event.level);
    switch (event.type) {
      case 'attack':
        run.attacks++; event.hit ? run.hits++ : run.misses++;
        if (!firstBlow.has(event.target.id)) firstBlow.set(event.target.id, event.t);
        break;
      case 'damage-dealt': run.damageDealt += event.amount; here.damageDealt += event.amount; break;
      case 'kill':
        run.kills++; here.kills++; run.killsByKind[event.target.kind] = (run.killsByKind[event.target.kind] ?? 0) + 1;
        run.timeToKill.push(event.t - (firstBlow.get(event.target.id) ?? event.t));
        run.xp += event.xp ?? 0; here.xp += event.xp ?? 0; run.xpByKind[event.target.kind] = (run.xpByKind[event.target.kind] ?? 0) + (event.xp ?? 0);
        break;
      case 'level-up': run.firstLevelUp ??= event.t; break;
      case 'loot': { // what a creature left on the floor, against what it could have left
        const kind = event.source.kind;
        run.dropValue += event.value; here.dropValue += event.value;
        run.dropValueByKind[kind] = (run.dropValueByKind[kind] ?? 0) + event.value; run.dropBudgetByKind[kind] = (run.dropBudgetByKind[kind] ?? 0) + event.budget;
        break;
      }
      case 'damage-taken':
        run.damageTaken += event.amount; here.damageTaken += event.amount; run.blowsTaken++;
        run.hpMin = Math.min(run.hpMin, event.hp);
        break;
      case 'evade': run.evaded++; break;
      case 'death': run.deaths++; run.deathBy = event.source?.kind ?? null; break;
      case 'use':
        if (!event.consumed) break;
        run.itemsUsed++; if (items[event.item]?.use?.restores) run.potionsUsed++;
        break;
      case 'pickup': {
        const value = (items[event.item]?.value ?? 0) * event.qty;
        run.loot[event.item] = (run.loot[event.item] ?? 0) + event.qty;
        run.lootItems += event.qty; run.lootValue += value; here.lootItems += event.qty; here.lootValue += value;
        break;
      }
      case 'level':
        levelOf(event.from).time += event.t - levelSince; levelOf(event.from).explored = sim.session.contextOf(event.from).exploration.known.size;
        levelSince = event.t;
        break;
    }
  });
  return {
    sample(t) {
      run.curve.push({ t, level: sim.level, hp: sim.hero.hp, heroLevel: sim.hero.level, xp: run.xp, kills: run.kills, damageTaken: run.damageTaken, lootItems: run.lootItems,
        explored: sim.session.context.exploration.known.size, alive: !sim.dead });
    },
    finish(outcome, { seed, trace: keepTrace }) {
      const here = levelOf(sim.level);
      here.time += sim.time - levelSince; here.explored = sim.session.context.exploration.known.size;
      const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
      return {
        seed, outcome, survived: !sim.dead && run.deaths === 0, time: sim.time, level: sim.level, hpEnd: sim.hero.hp, maxHp: sim.hero.maxHp, heroLevel: sim.hero.level, unspent: sim.hero.unspent,
        ...run, meanTimeToKill: run.timeToKill.length ? Math.round(mean(run.timeToKill)) : null, explored: Object.values(run.levels).reduce((a, l) => a + l.explored, 0),
        ...(keepTrace ? { trace } : {}),
      };
    },
  };
}

// The scalar measures of a run: the columns of the CSV and the numbers a summary averages.
export const MEASURES = ['time', 'kills', 'attacks', 'hits', 'misses', 'damageDealt', 'damageTaken', 'blowsTaken', 'evaded', 'potionsUsed',
  'itemsUsed', 'lootItems', 'lootValue', 'xp', 'heroLevel', 'dropValue', 'hpEnd', 'hpMin', 'meanTimeToKill', 'explored', 'deaths'];

const stats = values => {
  const list = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  return { mean: round(mean), median: round(list[Math.floor(list.length / 2)]), min: list[0], max: list[list.length - 1] };
};
const round = v => Math.round(v * 100) / 100;

// Over all runs: outcomes, survival, each measure's mean/median/min/max, kills, experience and loot per kind (mean per run;
// `dropValueByKind` against `dropBudgetByKind` shows how much of each creature's loot budget was really left), what
// killed the hero, every level's numbers (means), and the progress curve (means at each sample time).
export function summarise(runs, sampleMs = 10_000) {
  const n = runs.length || 1, perRun = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, round(v / n)]).sort());
  const sum = (key) => { const out = {}; for (const r of runs) for (const [k, v] of Object.entries(r[key])) out[k] = (out[k] ?? 0) + v; return out; };
  const outcomes = {}, deathsBy = {}, levels = {};
  for (const r of runs) {
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    if (r.deathBy) deathsBy[r.deathBy] = (deathsBy[r.deathBy] ?? 0) + 1;
    for (const [id, l] of Object.entries(r.levels)) {
      const to = (levels[id] ??= { runs: 0 });
      to.runs++;
      for (const [k, v] of Object.entries(l)) to[k] = (to[k] ?? 0) + v;
    }
  }
  for (const l of Object.values(levels)) for (const k of Object.keys(l)) if (k !== 'runs') l[k] = round(l[k] / l.runs);
  const curve = [];
  const longest = Math.max(0, ...runs.map(r => r.curve.length));
  for (let i = 0; i < longest; i++) {
    // A run that ended before this time counts as it ended (dead stays dead, a finished run keeps its score).
    const at = runs.map(r => r.curve[Math.min(i, r.curve.length - 1)]);
    const avg = key => round(at.reduce((a, s) => a + Number(s[key]), 0) / at.length);
    curve.push({ t: i * sampleMs, alive: avg('alive'), hp: avg('hp'), heroLevel: avg('heroLevel'), xp: avg('xp'), kills: avg('kills'), damageTaken: avg('damageTaken'), lootItems: avg('lootItems'), explored: avg('explored') });
  }
  return {
    runs: runs.length, outcomes, survivalRate: round(runs.filter(r => r.survived).length / n), winRate: round((outcomes.won ?? 0) / n),
    measures: Object.fromEntries(MEASURES.map(m => [m, stats(runs.map(r => r[m]))])),
    killsByKind: perRun(sum('killsByKind')), xpByKind: perRun(sum('xpByKind')), loot: perRun(sum('loot')),
    dropValueByKind: perRun(sum('dropValueByKind')), dropBudgetByKind: perRun(sum('dropBudgetByKind')), deathsBy, levels, curve,
  };
}

// One row per run.
export function toCsv(runs) {
  const columns = ['seed', 'outcome', 'survived', 'level', ...MEASURES];
  const cell = v => (v === null || v === undefined ? '' : typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : String(v));
  return [columns.join(','), ...runs.map(r => columns.map(c => cell(r[c])).join(','))].join('\n') + '\n';
}

// Two reports side by side: every summary number, before and after, and how much it moved.
export function compareReports(before, after) {
  const rows = [];
  const add = (metric, a, b) => {
    if (a === undefined && b === undefined) return;
    const delta = (b ?? 0) - (a ?? 0);
    rows.push({ metric, before: a ?? null, after: b ?? null, delta: round(delta), change: a ? `${delta >= 0 ? '+' : ''}${round(100 * delta / a)}%` : '' });
  };
  const [x, y] = [before.summary, after.summary];
  add('survivalRate', x.survivalRate, y.survivalRate);
  add('winRate', x.winRate, y.winRate);
  for (const m of MEASURES) add(`${m} (mean)`, x.measures[m]?.mean, y.measures[m]?.mean);
  for (const key of ['killsByKind', 'xpByKind', 'loot', 'dropValueByKind', 'dropBudgetByKind', 'deathsBy']) {
    for (const k of new Set([...Object.keys(x[key] ?? {}), ...Object.keys(y[key] ?? {})])) add(`${key}.${k}`, x[key]?.[k], y[key]?.[k]);
  }
  for (const id of new Set([...Object.keys(x.levels ?? {}), ...Object.keys(y.levels ?? {})])) {
    for (const k of ['kills', 'xp', 'damageTaken', 'lootItems', 'lootValue', 'dropValue', 'time']) add(`levels.${id}.${k}`, x.levels[id]?.[k], y.levels[id]?.[k]);
  }
  return rows;
}
