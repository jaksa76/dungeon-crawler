// A trap is concealed until inspected or triggered. Inspect it again to disarm it.
const tileKey = (level, x, z) => `${level}:${x},${z}`;

export function createTraps(definitions, { say, hurt }) {
  const byTile = new Map(), known = new Set(), disarmed = new Set();
  for (const [level, { level: definition }] of Object.entries(definitions)) {
    for (const trap of definition.traps ?? []) byTile.set(tileKey(level, trap.x, trap.z), trap);
  }

  function detect(level, x, z) {
    const key = tileKey(level, x, z), trap = byTile.get(key);
    if (!trap || known.has(key)) return false;
    known.add(key);
    say(trap.hint ?? `You find a ${trap.name}. Use it again to disarm it.`);
    return true;
  }

  function disarm(level, x, z) {
    const key = tileKey(level, x, z);
    if (!known.has(key) || disarmed.has(key)) return false;
    disarmed.add(key);
    say(`You disarm the ${byTile.get(key).name}.`);
    return true;
  }

  return {
    detect,
    disarm,
    inspect(level, x, z) {
      const key = tileKey(level, x, z);
      if (!byTile.has(key)) return false;
      if (!detect(level, x, z) && !disarm(level, x, z)) say(`The ${byTile.get(key).name} is already disarmed.`);
      return true;
    },
    enter(level, x, z) {
      const key = tileKey(level, x, z), trap = byTile.get(key);
      if (!trap || disarmed.has(key)) return;
      known.add(key);
      say(trap.message ?? `The ${trap.name} deals ${trap.damage} damage.`);
      hurt(trap.damage, { id: key, kind: trap.type ?? 'trap', name: trap.name });
    },
    persistence: {
      id: 'traps',
      save: () => ({ known: [...known], disarmed: [...disarmed] }),
      load(data) {
        this.reset();
        for (const key of Array.isArray(data?.known) ? data.known : []) if (byTile.has(key)) known.add(key);
        for (const key of Array.isArray(data?.disarmed) ? data.disarmed : []) if (known.has(key)) disarmed.add(key);
      },
      reset() { known.clear(); disarmed.clear(); },
    },
  };
}
