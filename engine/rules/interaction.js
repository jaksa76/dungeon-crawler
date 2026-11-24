// "Use": what the player does to whatever they are facing. The thing (an instance: a placed prop or NPC, see
// engine/core/world.js) has an `interact(game)` method, its own or its definition's (see behaviours.js for the
// interface and the factories). A thing may still carry a `behavior` as data, `{ type, ...options }`, which is turned
// into the same method:
//
//   { type: 'examine', text }                        say something
//   { type: 'open', title?, text?, contents?, loot? } open a container: see loot.js for contents and loot
//
// `ctx.game` is the API the method gets; without one, ctx itself (`say`, `openContainer`) serves.
import { behaviorTypes, behaviourFrom } from './behaviours.js';

// The method Use runs for a thing: its own, its data behaviour, or the prop's (definition's) default.
export function handlerOf(entity, prop = null) {
  if (typeof entity?.interact === 'function') return entity.interact;
  if (entity?.behavior) return behaviourFrom(entity.behavior);
  if (typeof prop?.interact === 'function') return prop.interact;
  return behaviourFrom(prop?.behavior);
}
const run = (target, ctx) => {
  const handler = handlerOf(target.entity, target.prop);
  if (!handler) return false;
  handler.call(target.entity, ctx.game ?? ctx);
  return true;
};

// Throws on a behavior the engine does not know, so a typo fails when the level loads.
export function checkBehavior(behavior, label) {
  if (behavior && !behaviorTypes[behavior.type]) throw new Error(`${label}: unknown behavior "${behavior.type}"`);
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
  const { entity } = target;
  if (target.tooFar) { ctx.say(entity.name ? `Step closer to use ${entity.name}.` : 'Step closer.'); return; }
  if (!run(target, ctx)) ctx.say(entity.name ? `You study ${entity.name}, but there is nothing to do yet.` : 'Nothing of interest.');
}

// Use what is in front of the player. ctx: `say`; `game`, the API handed to methods; `exit`, the passage they face, if
// any; `door`, the door ahead (an instance), if any; `pile()`, which opens whatever lies on the floor here and says
// whether anything did. A pile wins over anything that has no behaviour of its own, and over a door or passage ahead,
// but not over a container in reach.
export function interact(relCell, ctx) {
  const { say, exit = null, door = null, pile = () => false } = ctx;
  const target = findTarget(relCell);
  if (target && !target.tooFar) {
    const { entity } = target;
    if (!run(target, ctx) && !pile()) say(entity.name ? `You study ${entity.name}, but there is nothing to do yet.` : 'Nothing of interest.');
  } else if (pile()) return;
  else if (door) run({ entity: door }, ctx);
  else if (exit) say(exit.message ?? 'Step forward to pass through.');
  else if (target) say(target.entity.name ? `Step closer to use ${target.entity.name}.` : 'Step closer.');
  else say('There is nothing to use here.');
}
