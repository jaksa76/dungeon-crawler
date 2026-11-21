// "Use": what the player does to whatever they are facing. An entity (or the prop it is made
// from) carries a `behavior` as data, `{ type, ...options }`; each type is a handler below.
// An entity's own behavior wins over its prop's default. Later milestones add talk, open
// and shop here.

export const behaviors = {
  examine: (behavior, target, { say }) => say(behavior.text),
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

// Use what is in front of the player. `exit` is the passage they face, if any.
export function interact(relCell, { say, exit = null }) {
  const target = findTarget(relCell);
  if (target && !target.tooFar) {
    const { entity, prop } = target, behavior = entity.behavior ?? prop.behavior;
    if (behavior) behaviors[behavior.type](behavior, target, { say });
    else say(entity.name ? `You study ${entity.name}, but there is nothing to do yet.` : 'Nothing of interest.');
  } else if (exit) say(exit.message ?? 'Step forward to pass through.');
  else if (target) say(target.entity.name ? `Step closer to use ${target.entity.name}.` : 'Step closer.');
  else say('There is nothing to use here.');
}
