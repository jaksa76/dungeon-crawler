// A seeded source of chance: the same seed gives the same numbers, so a fight, a loot roll or a creature's wandering
// can be played again exactly. Mulberry32: small, fast, good enough for a game. `seed` is a number or any string.
export function createRng(seed = 1) {
  let state = typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : hash(String(seed));
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Where the sequence is, to carry on from it later (a replay that starts mid-run).
  random.state = () => state;
  return random;
}

// A string as a 32-bit seed (FNV-1a). A number-like string means that number, so ?seed=7 and seed 7 agree.
function hash(text) {
  if (/^\d+$/.test(text)) return Number(text) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
