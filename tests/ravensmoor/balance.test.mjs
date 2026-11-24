// The difficulty curve and the loot budgets, checked by bots before they ship (docs/engine/bots.md, "Balancing").
// The bounds are loose on purpose: they catch a retune that breaks progression or loot, not a few percent of drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBots } from '../../engine/sim/runner.js';
import { levelFor, resolveProgression } from '../../engine/rules/progression.js';
import { createMonster } from '../../engine/rules/stats.js';
import { campaign, levels, books } from '../support.mjs';
import { scenarios } from '../../games/ravensmoor/scenarios.js';
import fighter from '../../tools/bots/fighter.mjs';

const report = await runBots({ campaign, bot: fighter, runs: 30, scenario: scenarios['undercrypt-geared'], maxMs: 180_000 });
const { summary } = report;
const xpOf = kind => createMonster(books.monsters, kind, {}).xp;

test('clearing the Undercrypt is worth enough experience to reach the middle of the curve, not the end', () => {
  const total = levels.dungeon.level.monsters.reduce((sum, m) => sum + xpOf(m.monster), 0);
  const progression = resolveProgression(campaign.progression);
  assert.ok(total > 0);
  assert.ok(levelFor(total, progression) >= 4, `the whole crypt is only ${total} xp`);
  assert.ok(levelFor(total, progression) < progression.maxLevel, 'one level should not use up the whole curve');
});

test('a geared fighter levels up on the way, and what it kills pays the experience the book says', () => {
  assert.ok(summary.measures.heroLevel.mean >= 2, `mean hero level ${summary.measures.heroLevel.mean}`);
  assert.ok(summary.measures.xp.mean > 0);
  for (const run of report.runs) for (const [kind, xp] of Object.entries(run.xpByKind)) assert.equal(xp, run.killsByKind[kind] * xpOf(kind), `${kind}: ${xp} xp for ${run.killsByKind[kind]} kills`);
});

test('creatures leave no more than their budgets, and some leave something worth having', () => {
  const { dropValueByKind, dropBudgetByKind } = summary;
  assert.ok(Object.keys(dropBudgetByKind).length > 0, 'no creature left anything');
  for (const kind of Object.keys(dropValueByKind)) assert.ok(dropValueByKind[kind] <= dropBudgetByKind[kind] + 0.01, `${kind} left more than its budget`);
  for (const kind of ['rat', 'snake', 'spider']) assert.equal(dropValueByKind[kind], undefined, `${kind} should leave nothing`);
  assert.ok(summary.measures.dropValue.mean >= 30, `a run finds only ${summary.measures.dropValue.mean} of loot on creatures`);
});
