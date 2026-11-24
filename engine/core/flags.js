// Flags: the game's own small facts (`quests.ratKing = 'done'`, `met.guard = true`), saved with the game. This is
// the cheap way for a game to keep state: no section to write. Keys are strings (use dots to group them); values
// are anything JSON can hold. Dialogue, events and quests read and set these (M10).
export function createFlags(changed = () => {}) {
  const values = new Map();
  const flags = {
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set(key, value) {
      if (typeof key !== 'string' || !key) throw new Error('a flag needs a name');
      if (value === undefined) { flags.delete(key); return; }
      const json = JSON.stringify(value);
      if (values.has(key) && JSON.stringify(values.get(key)) === json) return;
      values.set(key, JSON.parse(json)); // throws on anything that cannot be saved
      changed(key, JSON.parse(json));
    },
    has: key => values.has(key),
    delete(key) {
      if (!values.delete(key)) return false;
      changed(key, undefined);
      return true;
    },
    get keys() { return [...values.keys()]; },
    // Registered by the engine in the `game` namespace.
    persistence: {
      id: 'flags',
      save: () => Object.fromEntries(values),
      load(data) { values.clear(); for (const [k, v] of Object.entries(data ?? {})) values.set(k, v); },
      reset: () => values.clear(),
    },
  };
  return flags;
}
