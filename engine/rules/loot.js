// What a container holds the first time it is opened: fixed `contents` plus items rolled from a loot table.
//
//   behavior.contents: [{ item, qty? }]                      always there
//   behavior.loot:     { rolls?, entries: [{ item, qty?, weight? }], none? }
//   behavior.generate: { budget? }  worked out from a value budget (generate-loot.js); the session passes
//                                   `generate(spec) -> [{ item, qty }]`
//
// `qty` is a number or a [min, max] range. Each of `rolls` (default 1) picks one entry by weight;
// `none` (default 0) is the weight of rolling nothing at all. `random` returns a number in [0, 1).

const amount = (qty = 1, random) => Array.isArray(qty) ? qty[0] + Math.floor(random() * (qty[1] - qty[0] + 1)) : qty;

export function rollLoot(table, random = Math.random) {
  const found = [];
  for (let r = 0; r < (table.rolls ?? 1); r++) {
    const total = table.entries.reduce((sum, e) => sum + (e.weight ?? 1), table.none ?? 0);
    let pick = random() * total;
    for (const e of table.entries) {
      pick -= e.weight ?? 1;
      if (pick < 0) { found.push({ item: e.item, qty: amount(e.qty, random) }); break; }
    }
  }
  return found;
}

// The stacks for a freshly opened container.
export function resolveContents(behavior, addToStacks, random = Math.random, generate = null) {
  const stacks = [];
  const give = ({ item, qty = 1 }) => addToStacks(stacks, item, amount(qty, random));
  for (const entry of behavior.contents ?? []) give(entry);
  if (behavior.loot) for (const entry of rollLoot(behavior.loot, random)) give(entry);
  if (behavior.generate && generate) for (const entry of generate(behavior.generate)) give(entry);
  return stacks;
}
