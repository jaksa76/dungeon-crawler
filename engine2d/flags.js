// Flags: the game's own small facts (`quests.ratKing = 'done'`, `met.guard = true`), saved with the game. This is
// the cheap way for a game to keep state: no section to write. Keys are strings (use dots to group them); values
// are anything JSON can hold. Dialogue, events and quests read and set these (M10).
export function createFlags() {
  const values = new Map();
  const flags = {
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set(key, value) {
      if (typeof key !== 'string' || !key) throw new Error('a flag needs a name');
      if (value === undefined) { values.delete(key); return; }
      values.set(key, JSON.parse(JSON.stringify(value))); // throws on anything that cannot be saved
    },
    has: key => values.has(key),
    delete: key => values.delete(key),
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
