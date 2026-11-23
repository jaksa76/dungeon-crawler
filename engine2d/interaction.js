// "Use": what the player does to whatever they are facing. An entity (or the prop it is made
// from) carries a `behavior` as data, `{ type, ...options }`; each type is a handler below.
// An entity's own behavior wins over its prop's default. Later milestones add talk and shop here.
//
//   { type: 'examine', text }                        say something
//   { type: 'open', title?, text?, contents?, loot? } open a container: see loot.js for contents and loot
//
// `open` hands the entity and its behavior to ctx.openContainer, which owns what is inside it.

export const behaviors = {
  examine: (behavior, target, { say }) => say(behavior.text),
  open: (behavior, target, { openContainer }) => openContainer(target.entity, behavior),
};

// Throws on a behavior the engine does not know, so a typo fails when the level loads.
export function checkBehavior(behavior, label) {
  if (behavior && !behaviors[behavior.type]) throw new Error(`${label}: unknown behavior "${behavior.type}"`);
}

// `relCell(l, d)` is the engine's view of the cell `d` ahead and `l` to the right of the player;
// its props carry the `anchor` side they stand on (see game.js). Reachable: against the far side
// of the player's own tile, or the near side of the tile ahead. Against the far side of the tile
// ahead is only seen, so the player has to step closer.
export function findTarget(relCell) {
  const here = relCell(0, 0)?.props ?? [], ahead = relCell(0, 1)?.props ?? [];
  const hit = here.find(p => p.anchor === 'far') ?? ahead.find(p => p.anchor === 'near');
  if (hit) return { prop: hit, entity: hit.entity };
  const seen = ahead.find(p => p.anchor === 'far');
  return seen ? { prop: seen, entity: seen.entity, tooFar: true } : null;
}

// Pointing names the exact rendered object. Reach is still governed by the same
// tile-side rules as Use, so a visible chest cannot be opened through a corridor.
export function interactTarget(target, ctx) {
  const { entity, prop } = target;
  if (target.tooFar) { ctx.say(entity.name ? `Step closer to use ${entity.name}.` : 'Step closer.'); return; }
  const behavior = entity.behavior ?? prop.behavior;
  if (behavior) behaviors[behavior.type](behavior, target, ctx);
  else ctx.say(entity.name ? `You study ${entity.name}, but there is nothing to do yet.` : 'Nothing of interest.');
}

// Use what is in front of the player. ctx: `say`; `exit`, the passage they face, if any; `openContainer`
// for `open` behaviors; `pile()`, which opens whatever lies on the floor here and says whether anything did. A pile wins over
// anything that has no behaviour of its own, and over a door ahead, but not over a container in reach.
export function interact(relCell, ctx) {
  const { say, exit = null, pile = () => false } = ctx;
  const target = findTarget(relCell);
  if (target && !target.tooFar) {
    const { entity, prop } = target, behavior = entity.behavior ?? prop.behavior;
    if (behavior) behaviors[behavior.type](behavior, target, ctx);
    else if (!pile()) say(entity.name ? `You study ${entity.name}, but there is nothing to do yet.` : 'Nothing of interest.');
  } else if (pile()) return;
  else if (exit) say(exit.message ?? 'Step forward to pass through.');
  else if (target) say(target.entity.name ? `Step closer to use ${target.entity.name}.` : 'Step closer.');
  else say('There is nothing to use here.');
}
